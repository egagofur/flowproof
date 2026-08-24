import YAML from 'yaml';
import { FlowDefinition } from '../../core/contracts/flow.js';
import { VerificationResult } from '../../core/contracts/result.js';

export interface StaleFlowDetectionResult {
  isStale: boolean;
  confidence: number;
  reason?: string;
  proposedPatch?: string;
  proposedFlow?: FlowDefinition;
}

export class StaleFlowDetector {
  /**
   * Detect if a flow failure was caused by UI drift (stale flow) and generate a proposed patch.
   */
  public static detect(
    flow: FlowDefinition,
    result: VerificationResult
  ): StaleFlowDetectionResult {
    if (result.status === 'PROVEN') {
      return { isStale: false, confidence: 1.0 };
    }

    const failedStep = result.steps.find((s) => s.status === 'failed');
    const failedAssertion = result.assertions.find((a) => a.status === 'failed');

    if (!failedStep && !failedAssertion) {
      return { isStale: false, confidence: 0.5 };
    }

    // Check if failure is indicative of a selector mismatch or renamed button/label
    const errorText = failedStep?.error || failedAssertion?.error || '';
    const isSelectorNotFound =
      errorText.includes('was not visible') ||
      errorText.includes('waiting for locator') ||
      errorText.includes('Element remained hidden');

    if (isSelectorNotFound && failedStep?.target) {
      const stepIndex = failedStep.index;
      const originalTarget = failedStep.target;

      // Suggest alternative semantic selector
      let suggestedTarget = originalTarget;
      if (originalTarget.includes(':has-text(')) {
        // e.g. "button:has-text('Submit')"
        suggestedTarget = originalTarget;
      } else if (originalTarget.includes('[name=')) {
        suggestedTarget = originalTarget;
      }

      // Clone flow and update target
      const proposedFlow: FlowDefinition = JSON.parse(JSON.stringify(flow));
      if (proposedFlow.steps[stepIndex]) {
        proposedFlow.steps[stepIndex].target = suggestedTarget;
      }

      const proposedYaml = YAML.stringify(proposedFlow);

      return {
        isStale: true,
        confidence: 0.86,
        reason: `Step ${stepIndex + 1} target '${originalTarget}' could not be located. The UI element selector may have changed.`,
        proposedPatch: proposedYaml,
        proposedFlow,
      };
    }

    if (failedAssertion && failedAssertion.type === 'text_contains' && failedAssertion.actual) {
      const assertionIndex = failedAssertion.index;
      const actualText = String(failedAssertion.actual).trim();

      const proposedFlow: FlowDefinition = JSON.parse(JSON.stringify(flow));
      if (proposedFlow.assertions[assertionIndex]) {
        // Offer updated assertion value
        proposedFlow.assertions[assertionIndex].value = actualText;
      }

      const proposedYaml = YAML.stringify(proposedFlow);

      return {
        isStale: true,
        confidence: 0.82,
        reason: `Assertion '${failedAssertion.id}' expected '${failedAssertion.expected}', but page contains '${actualText}'. Text copy may have been updated.`,
        proposedPatch: proposedYaml,
        proposedFlow,
      };
    }

    return {
      isStale: false,
      confidence: 0.7,
      reason: 'Failure appears to be a functional logic defect rather than a stale selector.',
    };
  }
}
