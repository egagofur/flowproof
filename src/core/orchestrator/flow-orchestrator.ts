import path from 'node:path';
import { FlowDefinition } from '../contracts/flow.js';
import { ExecutionContext, ExecutionOptions } from '../contracts/context.js';
import {
  ArtifactManifest,
  VerificationResult,
  VerificationStatus,
} from '../contracts/result.js';
import { ProjectConfig } from '../../adapter/config.js';
import { EvidenceManager } from '../evidence/evidence-manager.js';
import { SecretRedactor } from '../security/secret-redactor.js';
import { ExecutorRegistry } from '../../executors/base.js';
import { PlaywrightExecutor } from '../../executors/playwright/playwright-executor.js';
import { ResultAnalyzer } from '../../ai/analyzer/result-analyzer.js';

export interface OrchestratorOptions {
  config: ProjectConfig;
  evidenceManager?: EvidenceManager;
  secretRedactor?: SecretRedactor;
}

export class FlowOrchestrator {
  private config: ProjectConfig;
  private evidenceManager: EvidenceManager;
  private redactor: SecretRedactor;

  constructor(options: OrchestratorOptions) {
    this.config = options.config;
    this.redactor = options.secretRedactor || new SecretRedactor();
    this.evidenceManager =
      options.evidenceManager ||
      new EvidenceManager({
        baseArtifactsDir: this.config.artifactsDir,
        retentionDays: this.config.retentionDays,
        redactor: this.redactor,
      });

    // Register env secrets
    this.redactor.registerEnvSecrets(process.env);
  }

  /**
   * Run end-to-end verification for a single Flow Definition.
   */
  public async verifyFlow(
    flow: FlowDefinition,
    overrideOptions: ExecutionOptions = {}
  ): Promise<VerificationResult> {
    const mergedOptions: ExecutionOptions = {
      ...this.config.options,
      ...overrideOptions,
      executor:
        overrideOptions.executor ||
        flow.execution?.preferred ||
        this.config.defaultExecutor ||
        process.env.FLOWPROOF_BROWSER_EXECUTOR ||
        'playwright',
    };

    // 1. Initialize execution context and directories
    const context = await this.evidenceManager.createExecutionContext(
      flow.id,
      this.config.baseUrl,
      mergedOptions
    );

    // Call beforeFlow hook
    if (this.config.hooks?.beforeFlow) {
      await this.config.hooks.beforeFlow(flow);
    }

    const startTime = new Date().toISOString();
    const startMs = Date.now();

    let verificationStatus: VerificationStatus = 'PROVEN';
    let fatalError: string | undefined;

    // 2. Authentication Resolution
    try {
      for (const precondition of flow.preconditions) {
        if (precondition.authenticated_as) {
          const role = precondition.authenticated_as;
          const authStrategy = this.config.auth?.[role];

          if (!authStrategy) {
            verificationStatus = 'BLOCKED';
            fatalError = `No AuthStrategy registered for role '${role}' in flowproof.config`;
            break;
          }

          const authResult = await authStrategy.authenticate(context, role);
          if (!authResult.success) {
            verificationStatus = 'BLOCKED';
            fatalError = `Authentication failed for role '${role}': ${authResult.error}`;
            break;
          }

          context.auth = authResult.credentials;
        }
      }
    } catch (err: any) {
      verificationStatus = 'BLOCKED';
      fatalError = `Authentication precondition error: ${err.message}`;
    }

    let rawExecutionResult = {
      executor: mergedOptions.executor || 'playwright',
      status: verificationStatus,
      startTime,
      endTime: new Date().toISOString(),
      durationMs: 0,
      steps: [],
      assertions: [],
      checkpoints: [],
      error: fatalError,
      rawConsoleLogs: [],
      rawNetworkErrors: [],
    } as any;

    // 3. Browser Execution Dispatch (if not BLOCKED)
    if (verificationStatus !== 'BLOCKED') {
      const executorName = mergedOptions.executor || 'playwright';
      const executor = ExecutorRegistry.get(executorName);

      // Register project custom handlers if PlaywrightExecutor
      if (executor instanceof PlaywrightExecutor) {
        if (this.config.customActions) {
          for (const [name, handler] of Object.entries(this.config.customActions)) {
            executor.actionRunner.registerCustomHandler(name, handler);
          }
        }
        if (this.config.customAssertions) {
          for (const [name, handler] of Object.entries(this.config.customAssertions)) {
            executor.assertionRunner.registerCustomHandler(name, handler);
          }
        }
      }

      await executor.initialize(context);
      try {
        rawExecutionResult = await executor.execute(flow, context);
        verificationStatus = rawExecutionResult.status;
        fatalError = rawExecutionResult.error;
      } catch (err: any) {
        verificationStatus = 'FAILED';
        fatalError = `Executor encountered unexpected crash: ${err.message}`;
      } finally {
        await executor.cleanup();
      }
    }

    // 4. Save Logs
    const logPaths = await this.evidenceManager.saveLogs(
      context,
      rawExecutionResult.rawConsoleLogs || [],
      rawExecutionResult.rawNetworkErrors || [],
      fatalError ? `Fatal error: ${fatalError}` : 'Flow verification completed'
    );

    // 5. Build Artifact Manifest
    const screenshotPaths: string[] = [];
    for (const cp of rawExecutionResult.checkpoints || []) {
      for (const ev of cp.evidence || []) {
        if (ev.type === 'screenshot') {
          screenshotPaths.push(ev.path);
        }
      }
    }

    const artifacts: ArtifactManifest = {
      resultJson: path.join('result.json'),
      summaryMarkdown: path.join('summary.md'),
      screenshots: screenshotPaths,
      trace: rawExecutionResult.status !== 'PROVEN' ? path.join('trace', 'trace.zip') : undefined,
      consoleLog: logPaths.consoleLog,
      networkLog: logPaths.networkLog,
      orchestratorLog: logPaths.orchestratorLog,
    };

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const totalSteps = flow.steps.length;
    const passedSteps = rawExecutionResult.steps.filter((s: any) => s.status === 'passed').length;
    const totalAssertions = flow.assertions.length;
    const passedAssertions = rawExecutionResult.assertions.filter((a: any) => a.status === 'passed').length;

    // 6. Build Initial Verification Result
    let result: VerificationResult = {
      executionId: context.executionId,
      flowId: flow.id,
      flowName: flow.name,
      status: verificationStatus,
      executor: rawExecutionResult.executor || mergedOptions.executor || 'playwright',
      startTime,
      endTime,
      durationMs,
      totalSteps,
      passedSteps,
      totalAssertions,
      passedAssertions,
      checkpoints: rawExecutionResult.checkpoints || [],
      steps: rawExecutionResult.steps || [],
      assertions: rawExecutionResult.assertions || [],
      artifacts,
      error: fatalError,
    };

    // 7. Post-Execution AI Diagnostic Analysis
    const diagnostic = ResultAnalyzer.analyze(flow, result);
    result.diagnostic = diagnostic;

    // 8. Persist Final Artifacts
    result = await this.evidenceManager.finalizeExecutionResult(context, result);

    // Call afterFlow hook
    if (this.config.hooks?.afterFlow) {
      await this.config.hooks.afterFlow(flow, result);
    }

    return result;
  }
}
