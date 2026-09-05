import { describe, expect, it } from 'vitest';
import type { FlowDefinition } from '../../src/core/contracts/flow.js';
import { runVerificationSuite } from '../../src/cli/commands/verify.js';

const flows = ['one', 'two'].map((id): FlowDefinition => ({
  id,
  name: id,
  priority: 'high',
  roles: [],
  tags: [],
  preconditions: [],
  steps: [{ action: 'navigate', target: '/' }],
  assertions: [{ type: 'element_visible', target: 'body' }],
  evidence: { checkpoints: [] },
}));

describe('verification suite lifecycle', () => {
  it('runs beforeAll and afterAll once around all flows', async () => {
    const order: string[] = [];
    const results = await runVerificationSuite(flows, async (flow) => {
      order.push(`flow:${flow.id}`);
      return flow.id;
    }, {
      beforeAll: () => { order.push('beforeAll'); },
      afterAll: () => { order.push('afterAll'); },
    });
    expect(results).toEqual(['one', 'two']);
    expect(order).toEqual(['beforeAll', 'flow:one', 'flow:two', 'afterAll']);
  });

  it('runs afterAll when a flow throws', async () => {
    const order: string[] = [];
    await expect(runVerificationSuite(flows, async (flow) => {
      order.push(`flow:${flow.id}`);
      throw new Error('flow crashed');
    }, {
      beforeAll: () => { order.push('beforeAll'); },
      afterAll: () => { order.push('afterAll'); },
    })).rejects.toThrow('flow crashed');
    expect(order).toEqual(['beforeAll', 'flow:one', 'afterAll']);
  });

  it('still runs afterAll when beforeAll throws', async () => {
    const order: string[] = [];
    await expect(runVerificationSuite(flows, async () => 'unused', {
      beforeAll: () => { order.push('beforeAll'); throw new Error('setup failed'); },
      afterAll: () => { order.push('afterAll'); },
    })).rejects.toThrow('setup failed');
    expect(order).toEqual(['beforeAll', 'afterAll']);
  });
});
