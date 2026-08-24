import { describe, it, expect } from 'vitest';
import { AsidePromptTranslator } from '../../src/executors/aside/prompt-translator.js';
import { FlowDefinition } from '../../src/core/contracts/flow.js';

describe('Aside Agentic Executor', () => {
  const sampleFlow: FlowDefinition = {
    id: 'employee.remote-request',
    name: 'Employee Remote Request',
    description: 'Submit remote work request',
    priority: 'critical',
    roles: ['employee'],
    tags: ['remote'],
    preconditions: [{ route: '/remote-requests' }],
    steps: [
      { id: 's1', action: 'click', target: "button#new-req", description: 'Open request dialog' },
      { id: 's2', action: 'fill', target: 'input[name="reason"]', value: 'WFH sprint', description: 'Enter reason' },
    ],
    assertions: [
      { id: 'a1', type: 'text_contains', target: '.status', value: 'Pending', description: 'Verify status is Pending' },
    ],
    evidence: { checkpoints: [] },
  };

  it('should translate flow steps to semantic intent instructions', () => {
    const step1Intent = AsidePromptTranslator.translateStep(sampleFlow.steps[0]);
    expect(step1Intent).toBe('Open request dialog');

    const step2Intent = AsidePromptTranslator.translateStep(sampleFlow.steps[1]);
    expect(step2Intent).toBe('Enter reason');

    const rawStepIntent = AsidePromptTranslator.translateStep({
      action: 'click',
      target: 'button.save',
    });
    expect(rawStepIntent).toContain("button.save");
  });

  it('should build a comprehensive flow goal for Aside agent', () => {
    const flowGoal = AsidePromptTranslator.buildFlowGoal(sampleFlow);
    expect(flowGoal).toContain("Goal: Execute user flow 'Employee Remote Request'");
    expect(flowGoal).toContain("1. Open request dialog");
    expect(flowGoal).toContain("2. Enter reason");
    expect(flowGoal).toContain("1. Verify that: Verify status is Pending");
  });
});
