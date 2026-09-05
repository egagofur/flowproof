import type { Browser, BrowserContext, Locator, Page } from 'playwright';
import { chromium, firefox, webkit } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { BrowserExecutor } from '../base.js';
import type { FlowDefinition, FlowEvidenceCheckpoint } from '../../core/contracts/flow.js';
import type { ExecutionContext } from '../../core/contracts/context.js';
import type {
  ArtifactManifest,
  AssertionResult,
  CheckpointResult,
  EvidenceItem,
  ExecutionResult,
  RecordedError,
  StepResult,
  VerificationStatus,
} from '../../core/contracts/result.js';
import { SecretRedactor } from '../../core/security/secret-redactor.js';
import { PlaywrightActionRunner } from './actions.js';
import { PlaywrightAssertionRunner } from './assertions.js';
import { resolveLocator } from './locator-resolver.js';
import { detectDangerNotifications, evaluateErrorPolicy } from './error-policy.js';

export class PlaywrightExecutor implements BrowserExecutor {
  public readonly name = 'playwright';
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  public actionRunner = new PlaywrightActionRunner();
  public assertionRunner = new PlaywrightAssertionRunner();
  private consoleLogs: Array<{ type: string; text: string; time: string }> = [];
  private networkErrors: Array<{ url: string; status: number; method: string; error?: string }> = [];
  private recordedErrors: RecordedError[] = [];
  private tracingActive = false;

  public async initialize(context: ExecutionContext): Promise<void> {
    for (const [name, handler] of Object.entries(context.customActions || {})) this.actionRunner.registerCustomHandler(name, handler);
    for (const [name, handler] of Object.entries(context.customAssertions || {})) this.assertionRunner.registerCustomHandler(name, handler);

    const launcher = context.options.browser === 'firefox'
      ? firefox
      : context.options.browser === 'webkit'
        ? webkit
        : chromium;
    this.browser = await launcher.launch({ headless: context.options.headless ?? true });

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: context.options.viewport || { width: 1280, height: 720 },
      recordVideo: context.options.recordVideo ? { dir: path.join(context.artifactsDir, 'video') } : undefined,
      storageState: context.auth?.storageState as NonNullable<Parameters<Browser['newContext']>[0]>['storageState'],
      extraHTTPHeaders: context.auth?.headers,
    };
    this.context = await this.browser.newContext(contextOptions);

    if (context.auth?.cookies?.length) {
      await this.context.addCookies(context.auth.cookies.map((cookie) => ({
        ...cookie,
        domain: cookie.domain || new URL(context.baseUrl).hostname,
        path: cookie.path || '/',
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? false,
        sameSite: cookie.sameSite || 'Lax',
      })));
    }

    if (context.options.recordTrace ?? true) {
      await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      this.tracingActive = true;
    }

    this.page = await this.context.newPage();
    this.installListeners(this.page);
  }

  public async execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult> {
    if (!this.page || !this.context) throw new Error('PlaywrightExecutor must be initialized before execute()');
    const page = this.page;
    const startTime = new Date().toISOString();
    const startMs = Date.now();
    const steps: StepResult[] = [];
    const assertions: AssertionResult[] = [];
    const checkpoints = new Map<string, CheckpointResult>();
    const artifactWarnings: string[] = [];
    const generatedArtifacts: Partial<ArtifactManifest> = {};
    for (const checkpoint of flow.evidence.checkpoints) {
      checkpoints.set(checkpoint.id, { id: checkpoint.id, description: checkpoint.description, status: 'skipped', evidence: [] });
    }

    let status: VerificationStatus = 'PROVEN';
    let primaryError: string | undefined;
    try {
      for (const precondition of flow.preconditions) {
        if (!precondition.route) continue;
        const url = precondition.route.startsWith('http')
          ? precondition.route
          : new URL(precondition.route, context.baseUrl).toString();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      }

      for (let index = 0; index < flow.steps.length; index += 1) {
        const step = flow.steps[index];
        const started = Date.now();
        const id = step.id || `step-${index + 1}`;
        try {
          await this.actionRunner.runStep(page, step, context);
          steps.push({ id, index, action: step.action, target: step.target, value: step.value, status: 'passed', durationMs: Date.now() - started });
          await this.captureCheckpoints(
            flow.evidence.checkpoints.filter((item) => item.trigger === 'after_step' && (item.stepId === id || item.stepIndex === index)),
            checkpoints,
            context,
            'passed',
            artifactWarnings
          );
        } catch (error) {
          const detail = `Step ${index + 1} (${step.action}) failed: ${message(error)}`;
          steps.push({ id, index, action: step.action, target: step.target, value: step.value, status: 'failed', durationMs: Date.now() - started, error: detail });
          if (!step.optional) {
            status = 'FAILED';
            primaryError = detail;
            break;
          }
        }
      }

      if (status !== 'FAILED') {
        for (let index = 0; index < flow.assertions.length; index += 1) {
          const assertion = flow.assertions[index];
          const started = Date.now();
          const id = assertion.id || `assert-${index + 1}`;
          try {
            const evaluation = await this.assertionRunner.evaluate(page, assertion, context);
            assertions.push({
              id,
              index,
              type: assertion.type,
              target: assertion.target,
              expected: assertion.value,
              actual: evaluation.actual,
              status: evaluation.passed ? 'passed' : 'failed',
              durationMs: Date.now() - started,
              error: evaluation.error,
            });
            if (!evaluation.passed) {
              status = 'FAILED';
              primaryError ||= evaluation.error || `Assertion ${id} failed`;
            } else {
              await this.captureCheckpoints(
                flow.evidence.checkpoints.filter((item) => item.trigger === 'after_assertion' && (item.assertionId === id || item.assertionIndex === index)),
                checkpoints,
                context,
                'passed',
                artifactWarnings
              );
            }
          } catch (error) {
            const detail = `Assertion ${id} threw error: ${message(error)}`;
            assertions.push({ id, index, type: assertion.type, target: assertion.target, expected: assertion.value, status: 'failed', durationMs: Date.now() - started, error: detail });
            status = 'FAILED';
            primaryError ||= detail;
          }
        }
      }
    } catch (error) {
      status = 'BLOCKED';
      primaryError = `Execution blocked: ${message(error)}`;
    }

    await detectDangerNotifications(page, context.options.errorPolicy, this.recordedErrors).catch((error) => {
      artifactWarnings.push(`Danger notification detection failed: ${message(error)}`);
    });
    const policy = evaluateErrorPolicy(this.recordedErrors, context.options.errorPolicy);
    if (policy.violations.length > 0) {
      status = 'FAILED';
      primaryError ||= `Error policy violation: ${policy.violations.map((item) => `${item.rule}: ${item.message}`).join('; ')}`;
    }

    if (status === 'FAILED' || status === 'BLOCKED') {
      await this.captureCheckpoints(
        flow.evidence.checkpoints.filter((item) => item.trigger === 'on_failure'),
        checkpoints,
        context,
        'failed',
        artifactWarnings
      );
      const automatic = await this.captureAutomaticFailureEvidence(context, artifactWarnings);
      checkpoints.set(automatic.id, automatic);
      generatedArtifacts.screenshots = automatic.evidence.map((item) => item.path);
      if (await exists(path.join(context.evidenceDir, 'page.html'))) generatedArtifacts.pageHtml = path.join('evidence', 'page.html');
      if (await exists(path.join(context.evidenceDir, 'accessibility.json'))) generatedArtifacts.accessibilitySnapshot = path.join('evidence', 'accessibility.json');
    }

    await this.stopTrace(context, generatedArtifacts, artifactWarnings);

    return {
      executor: this.name,
      status,
      startTime,
      endTime: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      steps,
      assertions,
      checkpoints: [...checkpoints.values()],
      error: primaryError,
      rawConsoleLogs: this.consoleLogs,
      rawNetworkErrors: this.networkErrors,
      recordedErrors: policy.recordedErrors,
      policyViolations: policy.violations,
      artifactWarnings,
      generatedArtifacts,
    };
  }

  public async captureFailureEvidence(context: ExecutionContext) {
    const warnings: string[] = [];
    const generatedArtifacts: Partial<ArtifactManifest> = {};
    const checkpoint = await this.captureAutomaticFailureEvidence(context, warnings);
    generatedArtifacts.screenshots = checkpoint.evidence.map((item) => item.path);
    if (await exists(path.join(context.evidenceDir, 'page.html'))) generatedArtifacts.pageHtml = path.join('evidence', 'page.html');
    if (await exists(path.join(context.evidenceDir, 'accessibility.json'))) generatedArtifacts.accessibilitySnapshot = path.join('evidence', 'accessibility.json');
    await this.stopTrace(context, generatedArtifacts, warnings);
    return { checkpoints: [checkpoint], artifactWarnings: warnings, generatedArtifacts };
  }

  private async stopTrace(
    context: ExecutionContext,
    generatedArtifacts: Partial<ArtifactManifest>,
    warnings: string[]
  ): Promise<void> {
    if (!this.context || !this.tracingActive) return;
    const tracePath = path.join(context.tracesDir, 'trace.zip');
    try {
      await this.context.tracing.stop({ path: tracePath });
      generatedArtifacts.trace = path.join('trace', 'trace.zip');
    } catch (error) {
      warnings.push(`Trace capture failed: ${message(error)}`);
    } finally {
      this.tracingActive = false;
    }
  }

  private installListeners(page: Page): void {
    this.consoleLogs = [];
    this.networkErrors = [];
    this.recordedErrors = [];
    page.on('console', (entry) => {
      const time = new Date().toISOString();
      this.consoleLogs.push({ type: entry.type(), text: entry.text(), time });
      if (entry.type() === 'error') this.recordedErrors.push({ source: 'console', message: entry.text(), time });
    });
    page.on('pageerror', (error) => {
      const time = new Date().toISOString();
      this.consoleLogs.push({ type: 'pageerror', text: error.message, time });
      this.recordedErrors.push({ source: 'pageerror', message: error.message, time });
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const item = { url: response.url(), status: response.status(), method: response.request().method(), error: response.statusText() };
      this.networkErrors.push(item);
      this.recordedErrors.push({ source: 'http', message: `${item.method} ${item.url} returned ${item.status}`, time: new Date().toISOString(), ...item });
    });
    page.on('requestfailed', (request) => {
      const item = { url: request.url(), status: 0, method: request.method(), error: request.failure()?.errorText || 'Request failed' };
      this.networkErrors.push(item);
      this.recordedErrors.push({ source: 'requestfailed', message: `${item.method} ${item.url} failed: ${item.error}`, time: new Date().toISOString(), ...item });
    });
    page.on('dialog', (dialog) => {
      this.recordedErrors.push({ source: 'dialog', message: `${dialog.type()}: ${dialog.message()}`, time: new Date().toISOString() });
      void dialog.dismiss().catch(() => undefined);
    });
  }

  private async captureAutomaticFailureEvidence(
    context: ExecutionContext,
    warnings: string[]
  ): Promise<CheckpointResult> {
    const checkpoint: CheckpointResult = { id: 'automatic-failure', description: 'Automatic global failure evidence', status: 'failed', evidence: [] };
    if (!this.page) return checkpoint;
    const masks = this.screenshotMasks(this.page, context);
    await this.captureScreenshot('failure.png', false, masks, context, checkpoint, warnings);
    await this.captureScreenshot('failure-full-page.png', true, masks, context, checkpoint, warnings);

    const redactor = new SecretRedactor();
    redactor.registerEnvSecrets(context.env);
    for (const name of context.secretVariableNames) {
      const value = context.variables[name];
      if (typeof value === 'string') redactor.registerSecret(value);
    }
    await this.attempt('Page HTML capture', warnings, async () => {
      await fs.writeFile(path.join(context.evidenceDir, 'page.html'), redactor.redact(await this.page!.content()), 'utf8');
    });
    await this.attempt('Accessibility snapshot capture', warnings, async () => {
      const aria = await this.page!.locator('body').ariaSnapshot({ timeout: context.options.timeoutMs || 10000 });
      await fs.writeFile(path.join(context.evidenceDir, 'accessibility.json'), JSON.stringify({ ariaSnapshot: redactor.redact(aria) }, null, 2), 'utf8');
    });
    return checkpoint;
  }

  private screenshotMasks(page: Page, context: ExecutionContext): Locator[] {
    return [page.locator('input[type="password"]'), ...(context.options.screenshotMaskTargets || []).map((target) => resolveLocator(page, target))];
  }

  private async captureScreenshot(
    filename: string,
    fullPage: boolean,
    mask: Locator[],
    context: ExecutionContext,
    checkpoint: CheckpointResult,
    warnings: string[]
  ): Promise<void> {
    await this.attempt(`Screenshot '${filename}'`, warnings, async () => {
      const absolutePath = path.join(context.evidenceDir, filename);
      await this.page!.screenshot({ path: absolutePath, fullPage, mask });
      checkpoint.evidence.push(evidence(filename, absolutePath, checkpoint.id, 'failed'));
    });
  }

  private async captureCheckpoints(
    requested: FlowEvidenceCheckpoint[],
    results: Map<string, CheckpointResult>,
    context: ExecutionContext,
    status: CheckpointResult['status'],
    warnings: string[]
  ): Promise<void> {
    if (!this.page) return;
    for (const definition of requested) {
      const checkpoint = results.get(definition.id) || { id: definition.id, description: definition.description, status, evidence: [] };
      if (definition.screenshot) {
        await this.attempt(`Checkpoint screenshot '${definition.id}'`, warnings, async () => {
          const filename = `${definition.id}.png`;
          const absolutePath = path.join(context.evidenceDir, filename);
          if (definition.clipSelector) await this.page!.locator(definition.clipSelector).first().screenshot({ path: absolutePath });
          else await this.page!.screenshot({ path: absolutePath, fullPage: definition.fullPage ?? false, mask: this.screenshotMasks(this.page!, context) });
          checkpoint.evidence.push(evidence(filename, absolutePath, definition.id, status));
        });
      }
      checkpoint.status = status;
      results.set(definition.id, checkpoint);
    }
  }

  private async attempt(label: string, warnings: string[], operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      warnings.push(`${label} failed: ${message(error)}`);
    }
  }

  public async cleanup(): Promise<void> {
    if (this.page) await this.page.close().catch(() => undefined);
    if (this.context) await this.context.close().catch(() => undefined);
    if (this.browser) await this.browser.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
    this.tracingActive = false;
  }
}

function evidence(filename: string, absolutePath: string, checkpointId: string, status: CheckpointResult['status']): EvidenceItem {
  return {
    id: `evidence-${checkpointId}-${filename}`,
    checkpointId,
    type: 'screenshot',
    path: path.join('evidence', filename),
    absolutePath,
    timestamp: new Date().toISOString(),
    status,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
