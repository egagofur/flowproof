import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FlowDefinition } from '../../src/core/contracts/flow.js';
import { ExecutionContext } from '../../src/core/contracts/context.js';
import { ExecutionResult } from '../../src/core/contracts/result.js';
import { FlowOrchestrator } from '../../src/core/orchestrator/flow-orchestrator.js';
import { BrowserExecutor, ExecutorRegistry } from '../../src/executors/base.js';

const flow: FlowDefinition = {
  id: 'orchestrator.test',
  name: 'Orchestrator Test',
  priority: 'high',
  roles: [],
  tags: [],
  preconditions: [],
  steps: [{ id: 'step-1', action: 'navigate', target: '/' }],
  assertions: [{ id: 'assert-1', type: 'element_visible', target: 'body' }],
  evidence: { checkpoints: [] },
};

describe('FlowOrchestrator failures', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function createOrchestrator(
    executorName: string,
    executor: BrowserExecutor,
    hooks?: {
      beforeFlow?: () => Promise<void>;
      afterFlow?: () => Promise<void>;
    }
  ): Promise<FlowOrchestrator> {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-orchestrator-test-'));
    tempDirs.push(artifactsDir);
    ExecutorRegistry.register(executorName, () => executor);
    return new FlowOrchestrator({
      config: {
        baseUrl: 'http://localhost:3000',
        artifactsDir,
        defaultExecutor: executorName,
        hooks,
      },
    });
  }

  it('returns BLOCKED and cleans up when executor initialization fails', async () => {
    let cleanedUp = false;
    const executor: BrowserExecutor = {
      name: 'init-failure',
      initialize: async () => {
        throw new Error('browser unavailable');
      },
      execute: async () => provenResult(),
      cleanup: async () => {
        cleanedUp = true;
      },
    };
    const orchestrator = await createOrchestrator('init-failure', executor);

    const result = await orchestrator.verifyFlow(flow);

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toContain('Executor initialization failed: browser unavailable');
    expect(cleanedUp).toBe(true);
  });

  it('returns INCONCLUSIVE when execution crashes after initialization', async () => {
    const executor: BrowserExecutor = {
      name: 'execution-failure',
      initialize: async (_context: ExecutionContext) => {},
      execute: async () => {
        throw new Error('browser disconnected');
      },
      cleanup: async () => {},
    };
    const orchestrator = await createOrchestrator('execution-failure', executor);

    const result = await orchestrator.verifyFlow(flow);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.error).toContain('Executor encountered an unexpected error: browser disconnected');
  });

  it('returns INCONCLUSIVE when executor cleanup fails', async () => {
    const executor: BrowserExecutor = {
      name: 'cleanup-failure',
      initialize: async () => {},
      execute: async () => provenResult(),
      cleanup: async () => {
        throw new Error('trace could not be saved');
      },
    };
    const orchestrator = await createOrchestrator('cleanup-failure', executor);

    const result = await orchestrator.verifyFlow(flow);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.error).toContain('Executor cleanup failed: trace could not be saved');
  });

  it('returns structured hook failures', async () => {
    const executor: BrowserExecutor = {
      name: 'hook-failure',
      initialize: async () => {},
      execute: async () => provenResult(),
      cleanup: async () => {},
    };
    const orchestrator = await createOrchestrator('hook-failure', executor, {
      afterFlow: async () => {
        throw new Error('reporter unavailable');
      },
    });

    const result = await orchestrator.verifyFlow(flow);

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.error).toContain('afterFlow hook failed: reporter unavailable');
    expect(result.diagnostic?.rootCauseClassification).toBe('unknown');
  });

  it('persists a structured stale-selector suggestion', async () => {
    const executor: BrowserExecutor = {
      name: 'stale-selector',
      initialize: async () => {},
      execute: async () => ({
        ...provenResult(),
        status: 'FAILED',
        error: 'Step step-1 failed',
        steps: [
          {
            id: 'step-1',
            index: 0,
            action: 'navigate',
            target: "button:has-text('Continue')",
            status: 'failed',
            durationMs: 1,
            error: "Element was not visible while waiting for locator",
          },
        ],
      }),
      cleanup: async () => {},
    };
    const orchestrator = await createOrchestrator('stale-selector', executor);
    const staleFlow = {
      ...flow,
      steps: [
        {
          id: 'step-1',
          action: 'click' as const,
          target: "button:has-text('Continue')",
        },
      ],
    };

    const result = await orchestrator.verifyFlow(staleFlow);

    expect(result.diagnostic?.staleSuggestion?.changes?.[0]).toEqual(
      expect.objectContaining({
        id: 'step-1',
        current: "button:has-text('Continue')",
        suggested: 'role=button[name="Continue"]',
      })
    );
    expect(result.diagnostic?.stalePatchSuggestion).toContain(
      'role=button[name="Continue"]'
    );
  });
});

function provenResult(): ExecutionResult {
  return {
    executor: 'fake',
    status: 'PROVEN',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 1,
    steps: [],
    assertions: [],
    checkpoints: [],
  };
}
