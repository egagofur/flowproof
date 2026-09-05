import { describe, it, expect } from 'vitest';
import { StaleFlowDetector } from '../../src/ai/stale/stale-detector.js';
import { FlowDefinition } from '../../src/core/contracts/flow.js';
import { VerificationResult } from '../../src/core/contracts/result.js';

describe('StaleFlowDetector', () => {
  const sampleFlow: FlowDefinition = {
    id: 'test.flow',
    name: 'Test Flow',
    priority: 'high',
    roles: [],
    tags: [],
    preconditions: [],
    steps: [
      { id: 'step-1', action: 'click', target: "button:has-text('Create Request')" },
    ],
    assertions: [
      { id: 'assert-1', type: 'text_contains', target: 'span.status', value: 'Pending' },
    ],
    evidence: { checkpoints: [] },
  };

  it('should detect stale flow when selector is missing due to UI drift', () => {
    const failedResult: VerificationResult = {
      executionId: 'exec-1',
      flowId: 'test.flow',
      flowName: 'Test Flow',
      status: 'FAILED',
      executor: 'playwright',
      startTime: '',
      endTime: '',
      durationMs: 1000,
      totalSteps: 1,
      passedSteps: 0,
      totalAssertions: 1,
      passedAssertions: 0,
      checkpoints: [],
      steps: [
        {
          id: 'step-1',
          index: 0,
          action: 'click',
          target: "button:has-text('Create Request')",
          status: 'failed',
          durationMs: 500,
          error: "Element 'button:has-text('Create Request')' was not visible within 5000ms",
        },
      ],
      assertions: [],
      artifacts: { resultJson: '', summaryMarkdown: '', screenshots: [] },
    };

    const staleResult = StaleFlowDetector.detect(sampleFlow, failedResult);
    expect(staleResult.isStale).toBe(true);
    expect(staleResult.confidence).toBeGreaterThan(0.8);
    expect(staleResult.proposedPatch).toBeDefined();
    expect(staleResult.changes).toEqual([
      {
        subject: 'step',
        id: 'step-1',
        field: 'target',
        current: "button:has-text('Create Request')",
        suggested: 'role=button[name="Create Request"]',
      },
    ]);
    expect(staleResult.reason).toContain("target 'button:has-text('Create Request')' could not be located");
  });
});
