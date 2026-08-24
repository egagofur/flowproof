import { FlowDefinition } from '../../core/contracts/flow.js';
import {
  DiagnosticAnalysis,
  RootCauseClassification,
  VerificationResult,
} from '../../core/contracts/result.js';

export class ResultAnalyzer {
  /**
   * Perform AI heuristic & rule-based diagnostic analysis of verification outcome.
   */
  public static analyze(
    flow: FlowDefinition,
    result: VerificationResult
  ): DiagnosticAnalysis {
    const evidenceReferences: string[] = [];

    // Collect evidence references
    for (const cp of result.checkpoints) {
      for (const ev of cp.evidence) {
        evidenceReferences.push(ev.path);
      }
    }
    if (result.artifacts.trace) {
      evidenceReferences.push(result.artifacts.trace);
    }

    if (result.status === 'PROVEN') {
      return {
        summary: `All ${result.totalSteps} steps executed and ${result.totalAssertions} assertions verified successfully. Intent proven with ${evidenceReferences.length} evidence artifact(s).`,
        rootCauseClassification: 'unknown',
        confidence: 0.99,
        recommendations: [
          'Flow is verified and healthy. Ready for deployment or merge.',
        ],
        evidenceReferences,
        affectedFeatures: flow.tags,
      };
    }

    if (result.status === 'BLOCKED') {
      const isAuth = result.error?.toLowerCase().includes('auth') || result.error?.toLowerCase().includes('credential');
      const classification: RootCauseClassification = isAuth ? 'auth_failure' : 'environment_failure';

      return {
        summary: `Verification BLOCKED prior to completing assertions: ${result.error || 'Unknown setup block'}.`,
        failureReason: result.error,
        rootCauseClassification: classification,
        confidence: 0.95,
        recommendations: [
          'Check application server availability at target baseUrl.',
          'Verify test role credentials and authentication strategy in flowproof.config.',
        ],
        evidenceReferences,
        affectedFeatures: flow.tags,
      };
    }

    // Status is FAILED
    const failedStep = result.steps.find((s) => s.status === 'failed');
    const failedAssertion = result.assertions.find((a) => a.status === 'failed');

    let classification: RootCauseClassification = 'application_regression';
    let confidence = 0.85;
    const recommendations: string[] = [];
    let summary = '';
    let failureReason = '';

    if (failedStep) {
      failureReason = failedStep.error || `Step ${failedStep.index + 1} (${failedStep.action}) failed`;
      const isTimeout = failureReason.toLowerCase().includes('timeout');
      const isNotFound = failureReason.toLowerCase().includes('not visible') || failureReason.toLowerCase().includes('waiting for');

      if (isNotFound) {
        classification = 'stale_selector';
        confidence = 0.88;
        summary = `Step ${failedStep.index + 1} failed to interact with '${failedStep.target}'. Possible UI drift or renamed component.`;
        recommendations.push(
          `Inspect element '${failedStep.target}' in checkpoint screenshot.`,
          'Run `flowproof inspect` or check if the button/input selector was updated in recent commits.'
        );
      } else if (isTimeout) {
        classification = 'flaky_timeout';
        confidence = 0.78;
        summary = `Step ${failedStep.index + 1} timed out while waiting for '${failedStep.target}'.`;
        recommendations.push(
          'Check if slow network responses or backend latency delayed UI rendering.',
          'Increase step timeout or verify backend service performance.'
        );
      } else {
        summary = `Step execution failed at step ${failedStep.index + 1}: ${failureReason}`;
        recommendations.push('Review error logs and ensure step preconditions were satisfied.');
      }
    } else if (failedAssertion) {
      failureReason = failedAssertion.error || `Assertion ${failedAssertion.id} failed`;
      classification = 'application_regression';
      confidence = 0.92;
      summary = `Assertion '${failedAssertion.id}' failed (${failedAssertion.type}): ${failureReason}. Expected behavior was not satisfied by the application.`;
      recommendations.push(
        'Review recent code changes affecting the feature logic.',
        `Inspect evidence screenshot for checkpoint preceding '${failedAssertion.id}'.`,
        'Verify database persistence and state mutation logic.'
      );
    } else {
      failureReason = result.error || 'Unknown failure';
      summary = `Verification failed: ${failureReason}`;
      recommendations.push('Inspect logs and trace zip for detailed diagnostic info.');
    }

    return {
      summary,
      failureReason,
      rootCauseClassification: classification,
      confidence,
      recommendations,
      evidenceReferences,
      affectedFeatures: flow.tags,
    };
  }
}
