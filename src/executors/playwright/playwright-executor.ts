import { Browser, BrowserContext, chromium, firefox, webkit, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { BrowserExecutor } from '../base.js';
import { FlowDefinition, FlowEvidenceCheckpoint } from '../../core/contracts/flow.js';
import { ExecutionContext } from '../../core/contracts/context.js';
import {
  AssertionResult,
  CheckpointResult,
  EvidenceItem,
  ExecutionResult,
  StepResult,
  VerificationStatus,
} from '../../core/contracts/result.js';
import { PlaywrightActionRunner, CustomActionHandler } from './actions.js';
import { PlaywrightAssertionRunner, CustomAssertionHandler } from './assertions.js';

export class PlaywrightExecutor implements BrowserExecutor {
  public readonly name = 'playwright';

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  public actionRunner = new PlaywrightActionRunner();
  public assertionRunner = new PlaywrightAssertionRunner();

  private consoleLogs: Array<{ type: string; text: string; time: string }> = [];
  private networkErrors: Array<{ url: string; status: number; method: string; error?: string }> = [];

  public async initialize(context: ExecutionContext): Promise<void> {
    const browserType = context.options.browser || 'chromium';
    const headless = context.options.headless ?? true;

    const launcher =
      browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;

    this.browser = await launcher.launch({
      headless,
    });

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: context.options.viewport || { width: 1280, height: 720 },
      recordVideo: context.options.recordVideo
        ? { dir: path.join(context.artifactsDir, 'video') }
        : undefined,
    };

    if (context.auth?.storageState) {
      contextOptions.storageState = context.auth.storageState as any;
    }

    if (context.auth?.headers) {
      contextOptions.extraHTTPHeaders = context.auth.headers;
    }

    this.context = await this.browser.newContext(contextOptions);

    if (context.auth?.cookies && context.auth.cookies.length > 0) {
      const formattedCookies = context.auth.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || new URL(context.baseUrl).hostname,
        path: c.path || '/',
        httpOnly: c.httpOnly ?? false,
        secure: c.secure ?? false,
        sameSite: c.sameSite || 'Lax',
      }));
      await this.context.addCookies(formattedCookies);
    }

    if (context.options.recordTrace ?? true) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
    }

    this.page = await this.context.newPage();

    // Listen to console and network
    this.consoleLogs = [];
    this.networkErrors = [];

    this.page.on('console', (msg) => {
      this.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        time: new Date().toISOString(),
      });
    });

    this.page.on('pageerror', (err) => {
      this.consoleLogs.push({
        type: 'error',
        text: `Uncaught page error: ${err.message}`,
        time: new Date().toISOString(),
      });
    });

    this.page.on('response', (res) => {
      if (res.status() >= 400) {
        this.networkErrors.push({
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
          error: res.statusText(),
        });
      }
    });

    this.page.on('requestfailed', (req) => {
      this.networkErrors.push({
        url: req.url(),
        status: 0,
        method: req.method(),
        error: req.failure()?.errorText || 'Request failed',
      });
    });
  }

  public async execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult> {
    if (!this.page || !this.context) {
      throw new Error('PlaywrightExecutor must be initialized before execute()');
    }

    const startTime = new Date().toISOString();
    const startMs = Date.now();

    const stepResults: StepResult[] = [];
    const assertionResults: AssertionResult[] = [];
    const checkpointMap = new Map<string, CheckpointResult>();

    // Initialize checkpoint status map
    for (const cp of flow.evidence.checkpoints) {
      checkpointMap.set(cp.id, {
        id: cp.id,
        description: cp.description,
        status: 'skipped',
        evidence: [],
      });
    }

    let overallStatus: VerificationStatus = 'PROVEN';
    let fatalError: string | undefined;

    try {
      // 1. Check preconditions (e.g. initial route navigation)
      for (const precondition of flow.preconditions) {
        if (precondition.route) {
          const targetUrl = precondition.route.startsWith('http')
            ? precondition.route
            : new URL(precondition.route, context.baseUrl).toString();
          await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        }
      }

      // 2. Execute Steps
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        const stepStartMs = Date.now();
        const stepId = step.id || `step-${i + 1}`;

        try {
          await this.actionRunner.runStep(this.page, step, context);
          stepResults.push({
            id: stepId,
            index: i,
            action: step.action,
            target: step.target,
            value: step.value,
            status: 'passed',
            durationMs: Date.now() - stepStartMs,
          });

          // Check if any checkpoints trigger after this step
          await this.captureCheckpoints(
            flow.evidence.checkpoints.filter(
              (cp) =>
                cp.trigger === 'after_step' &&
                (cp.stepId === stepId || cp.stepIndex === i)
            ),
            checkpointMap,
            context,
            'passed'
          );
        } catch (err: any) {
          const stepErr = `Step ${i + 1} (${step.action}) failed: ${err.message}`;
          stepResults.push({
            id: stepId,
            index: i,
            action: step.action,
            target: step.target,
            value: step.value,
            status: 'failed',
            durationMs: Date.now() - stepStartMs,
            error: stepErr,
          });

          if (!step.optional) {
            overallStatus = 'FAILED';
            fatalError = stepErr;
            break;
          }
        }
      }

      // 3. Evaluate Assertions (only if steps did not critically fail)
      if (overallStatus !== 'FAILED') {
        for (let j = 0; j < flow.assertions.length; j++) {
          const assertion = flow.assertions[j];
          const assertStartMs = Date.now();
          const assertionId = assertion.id || `assert-${j + 1}`;

          try {
            const evalResult = await this.assertionRunner.evaluate(
              this.page,
              assertion,
              context
            );

            if (evalResult.passed) {
              assertionResults.push({
                id: assertionId,
                index: j,
                type: assertion.type,
                target: assertion.target,
                expected: assertion.value,
                actual: evalResult.actual,
                status: 'passed',
                durationMs: Date.now() - assertStartMs,
              });

              // Checkpoint after assertion
              await this.captureCheckpoints(
                flow.evidence.checkpoints.filter(
                  (cp) =>
                    cp.trigger === 'after_assertion' &&
                    (cp.assertionId === assertionId || cp.assertionIndex === j)
                ),
                checkpointMap,
                context,
                'passed'
              );
            } else {
              overallStatus = 'FAILED';
              const errMsg = evalResult.error || `Assertion ${assertionId} failed`;
              assertionResults.push({
                id: assertionId,
                index: j,
                type: assertion.type,
                target: assertion.target,
                expected: assertion.value,
                actual: evalResult.actual,
                status: 'failed',
                durationMs: Date.now() - assertStartMs,
                error: errMsg,
              });

              if (!fatalError) fatalError = errMsg;
            }
          } catch (err: any) {
            overallStatus = 'FAILED';
            const errMsg = `Assertion ${assertionId} threw error: ${err.message}`;
            assertionResults.push({
              id: assertionId,
              index: j,
              type: assertion.type,
              target: assertion.target,
              expected: assertion.value,
              status: 'failed',
              durationMs: Date.now() - assertStartMs,
              error: errMsg,
            });

            if (!fatalError) fatalError = errMsg;
          }
        }
      }
    } catch (err: any) {
      overallStatus = 'BLOCKED';
      fatalError = `Execution blocked: ${err.message}`;
    }

    // Capture on_failure checkpoints if failed
    if (overallStatus === 'FAILED' || overallStatus === 'BLOCKED') {
      await this.captureCheckpoints(
        flow.evidence.checkpoints.filter((cp) => cp.trigger === 'on_failure'),
        checkpointMap,
        context,
        'failed'
      );
    }

    // Stop and save trace
    if (this.context && (context.options.recordTrace ?? true)) {
      const tracePath = path.join(context.tracesDir, 'trace.zip');
      try {
        await this.context.tracing.stop({ path: tracePath });
      } catch {
        // tracing stop error fallback
      }
    }

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    return {
      executor: this.name,
      status: overallStatus,
      startTime,
      endTime,
      durationMs,
      steps: stepResults,
      assertions: assertionResults,
      checkpoints: Array.from(checkpointMap.values()),
      error: fatalError,
      rawConsoleLogs: this.consoleLogs,
      rawNetworkErrors: this.networkErrors,
    };
  }

  private async captureCheckpoints(
    checkpoints: FlowEvidenceCheckpoint[],
    checkpointMap: Map<string, CheckpointResult>,
    context: ExecutionContext,
    status: CheckpointResult['status']
  ): Promise<void> {
    if (!this.page) return;

    for (const cp of checkpoints) {
      const existing = checkpointMap.get(cp.id) || {
        id: cp.id,
        description: cp.description,
        status,
        evidence: [],
      };

      if (cp.screenshot) {
        try {
          const filename = `${cp.id}.png`;
          const filePath = path.join(context.evidenceDir, filename);

          if (cp.clipSelector) {
            const el = this.page.locator(cp.clipSelector).first();
            await el.screenshot({ path: filePath });
          } else {
            await this.page.screenshot({
              path: filePath,
              fullPage: cp.fullPage ?? false,
            });
          }

          const evidenceItem: EvidenceItem = {
            id: `evidence-${cp.id}-${Date.now()}`,
            checkpointId: cp.id,
            type: 'screenshot',
            path: path.join('evidence', filename),
            absolutePath: filePath,
            timestamp: new Date().toISOString(),
            status,
          };

          existing.evidence.push(evidenceItem);
          existing.status = status;
        } catch {
          // Screenshot capture failure handled gracefully
        }
      }

      checkpointMap.set(cp.id, existing);
    }
  }

  public async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
