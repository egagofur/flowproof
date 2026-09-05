import path from 'node:path';
import { FlowDefinition } from '../contracts/flow.js';
import { ExecutionContext, ExecutionOptions } from '../contracts/context.js';
import {
  ArtifactManifest,
  ExecutionResult,
  VerificationResult,
  VerificationStatus,
} from '../contracts/result.js';
import { ProjectConfig } from '../../adapter/config.js';
import { EvidenceManager } from '../evidence/evidence-manager.js';
import { SecretRedactor } from '../security/secret-redactor.js';
import { ExecutorRegistry } from '../../executors/base.js';
import { ResultAnalyzer } from '../../ai/analyzer/result-analyzer.js';
import { StaleFlowDetector } from '../../ai/stale/stale-detector.js';
import { resolveFlowRuntime } from '../runtime/interpolation.js';
import type { FlowLifecycleContext } from '../../adapter/config.js';

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
    const fixtureValues = typeof this.config.variables === 'function'
      ? await this.config.variables(flow)
      : this.config.variables;
    const runtime = resolveFlowRuntime(flow, { fixtureValues, env: process.env });
    const resolvedFlow = runtime.flow;
    for (const name of runtime.secretVariableNames) {
      const value = runtime.variables[name];
      if (typeof value === 'string') this.redactor.registerSecret(value);
    }

    const mergedOptions: ExecutionOptions = {
      ...this.config.options,
      ...overrideOptions,
      executor:
        overrideOptions.executor ||
        resolvedFlow.execution?.preferred ||
        this.config.defaultExecutor ||
        process.env.INTENTPROOF_BROWSER_EXECUTOR ||
        'playwright',
    };

    // 1. Initialize execution context and directories
    const context = await this.evidenceManager.createExecutionContext(
      resolvedFlow.id,
      this.config.baseUrl,
      mergedOptions
    );
    context.customActions = this.config.customActions;
    context.customAssertions = this.config.customAssertions;
    context.variables = runtime.variables;
    context.secretVariableNames = runtime.secretVariableNames;

    const cleanups: Array<() => Promise<void> | void> = [];
    const lifecycle: FlowLifecycleContext = {
      registerCleanup(cleanup) {
        cleanups.push(cleanup);
      },
    };

    const startTime = new Date().toISOString();
    const startMs = Date.now();

    let verificationStatus: VerificationStatus = 'PROVEN';
    let fatalError: string | undefined;

    try {
      await this.config.hooks?.beforeFlow?.(resolvedFlow, lifecycle);
    } catch (err: any) {
      verificationStatus = 'BLOCKED';
      fatalError = `beforeFlow hook failed: ${err.message}`;
    }

    // 2. Authentication Resolution
    if (verificationStatus !== 'BLOCKED') {
      try {
        for (const precondition of resolvedFlow.preconditions) {
          if (precondition.authenticated_as) {
            const role = precondition.authenticated_as;
            const authStrategy = this.config.auth?.[role];

            if (!authStrategy) {
              verificationStatus = 'BLOCKED';
              fatalError = `No AuthStrategy registered for role '${role}' in intentproof.config`;
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
    }

    let rawExecutionResult: ExecutionResult = {
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
      artifactWarnings: verificationStatus === 'BLOCKED'
        ? ['Automatic browser failure evidence was unavailable because execution was blocked before a page was initialized.']
        : [],
    };

    // 3. Browser Execution Dispatch (if not BLOCKED)
    if (verificationStatus !== 'BLOCKED') {
      const executorName = mergedOptions.executor || 'playwright';
      let executor;
      let initialized = false;
      try {
        executor = ExecutorRegistry.get(executorName);
        await executor.initialize(context);
        initialized = true;
        rawExecutionResult = await executor.execute(resolvedFlow, context);
        verificationStatus = rawExecutionResult.status;
        fatalError = rawExecutionResult.error;
      } catch (err: any) {
        verificationStatus = initialized ? 'INCONCLUSIVE' : 'BLOCKED';
        fatalError = initialized
          ? `Executor encountered an unexpected error: ${err.message}`
          : `Executor initialization failed: ${err.message}`;
        rawExecutionResult.status = verificationStatus;
        rawExecutionResult.error = fatalError;
        if (initialized && executor?.captureFailureEvidence) {
          try {
            const captured = await executor.captureFailureEvidence(context);
            rawExecutionResult.checkpoints = captured.checkpoints;
            rawExecutionResult.artifactWarnings = captured.artifactWarnings;
            rawExecutionResult.generatedArtifacts = captured.generatedArtifacts;
          } catch (captureError: any) {
            rawExecutionResult.artifactWarnings = [`Automatic failure evidence failed: ${captureError.message}`];
          }
        } else {
          rawExecutionResult.artifactWarnings = ['Automatic browser failure evidence was unavailable because no live page was initialized.'];
        }
      } finally {
        if (executor) {
          try {
            await executor.cleanup();
          } catch (err: any) {
            verificationStatus = 'INCONCLUSIVE';
            fatalError = [fatalError, `Executor cleanup failed: ${err.message}`]
              .filter(Boolean)
              .join(' ');
          }
        }
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

    const generated = rawExecutionResult.generatedArtifacts || {};
    const artifacts: ArtifactManifest = {
      resultJson: path.join('result.json'),
      summaryMarkdown: path.join('summary.md'),
      screenshots: [...new Set([...screenshotPaths, ...(generated.screenshots || [])])],
      trace: generated.trace,
      pageHtml: generated.pageHtml,
      accessibilitySnapshot: generated.accessibilitySnapshot,
      consoleLog: logPaths.consoleLog,
      networkLog: logPaths.networkLog,
      orchestratorLog: logPaths.orchestratorLog,
    };

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const totalSteps = resolvedFlow.steps.length;
    const passedSteps = rawExecutionResult.steps.filter((step) => step.status === 'passed').length;
    const totalAssertions = resolvedFlow.assertions.length;
    const passedAssertions = rawExecutionResult.assertions.filter((assertion) => assertion.status === 'passed').length;

    // 6. Build Initial Verification Result
    let result: VerificationResult = {
      executionId: context.executionId,
      flowId: resolvedFlow.id,
      flowName: resolvedFlow.name,
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
      policyViolations: rawExecutionResult.policyViolations,
      artifactWarnings: rawExecutionResult.artifactWarnings,
    };

    try {
      await this.config.hooks?.afterFlow?.(resolvedFlow, result, lifecycle);
    } catch (err: any) {
      result.status = 'INCONCLUSIVE';
      result.error = [result.error, `afterFlow hook failed: ${err.message}`].filter(Boolean).join(' ');
    } finally {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (err: any) {
          result.status = result.status === 'PROVEN' ? 'INCONCLUSIVE' : result.status;
          result.error = [result.error, `Flow cleanup failed: ${err.message}`].filter(Boolean).join(' ');
        }
      }
    }

    // 7. Post-Execution AI Diagnostic Analysis
    const diagnostic = ResultAnalyzer.analyze(resolvedFlow, result);
    const staleSuggestion = StaleFlowDetector.detect(resolvedFlow, result);
    if (staleSuggestion.isStale) {
      diagnostic.staleSuggestion = staleSuggestion;
      diagnostic.stalePatchSuggestion = staleSuggestion.proposedPatch;
    }
    result.diagnostic = diagnostic;

    // 8. Persist Final Artifacts
    result = await this.evidenceManager.finalizeExecutionResult(context, result);

    return result;
  }
}
