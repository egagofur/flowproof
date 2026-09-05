import YAML from 'yaml';
import { FlowDefinition } from '../../core/contracts/flow.js';
import {
  StaleFlowChange,
  StaleFlowSuggestion,
  VerificationResult,
} from '../../core/contracts/result.js';

export interface StaleFlowDetectionResult extends StaleFlowSuggestion {
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

      const suggestedTarget = this.suggestSemanticSelector(originalTarget);
      const changes: StaleFlowChange[] = [
        {
          subject: 'step',
          id: failedStep.id,
          field: 'target',
          current: originalTarget,
          suggested: suggestedTarget,
        },
      ];

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
        changes,
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
        changes: [
          {
            subject: 'assertion',
            id: failedAssertion.id,
            field: 'value',
            current: String(failedAssertion.expected ?? ''),
            suggested: actualText,
          },
        ],
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

  private static suggestSemanticSelector(target: string): string {
    const textSelector = target.match(
      /^([a-z][\w-]*):has-text\((['"])(.+)\2\)$/i
    );
    if (!textSelector) {
      return target;
    }

    const [, tag, , text] = textSelector;
    const roleByTag: Record<string, string> = {
      a: 'link',
      button: 'button',
      input: 'textbox',
    };
    const role = roleByTag[tag.toLowerCase()];
    return role ? `role=${role}[name="${text}"]` : `text="${text}"`;
  }
}
