import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteWorkServer } from '../../examples/remote-work-app/server.js';
import { FlowDefinition } from '../../src/core/contracts/flow.js';
import { FlowOrchestrator } from '../../src/core/orchestrator/flow-orchestrator.js';
import { AdapterRegistry } from '../../src/adapter/registry.js';
import { HybridExecutor } from '../../src/executors/hybrid.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const exampleAppDir = path.resolve(projectRoot, 'examples/remote-work-app');

describe('Hybrid Executor & Aside Adaptive Fallback', () => {
  let serverHandle: { server: any; url: string; close: () => Promise<void> };

  beforeAll(async () => {
    serverHandle = await createRemoteWorkServer(3355);
  });

  afterAll(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
  });

  it('should adaptively verify flow using Aside executor directly', async () => {
    const config = await AdapterRegistry.loadConfig(exampleAppDir, 'flowproof.config.ts');
    config.baseUrl = serverHandle.url;
    config.defaultExecutor = 'aside';

    const flow: FlowDefinition = {
      id: 'employee.remote-request.aside',
      name: 'Employee Remote Request (Agentic Aside)',
      description: 'Agentic verification using semantic intents',
      priority: 'high',
      roles: ['employee'],
      tags: ['remote-request'],
      preconditions: [
        { authenticated_as: 'employee' },
        { route: '/remote-requests' },
      ],
      steps: [
        {
          id: 'step-1',
          action: 'click',
          target: "button:has-text('New Request')",
          description: 'Open new request modal',
        },
        {
          id: 'step-2',
          action: 'fill',
          target: 'textarea#request-reason',
          value: 'Aside agentic verified sprint',
          description: 'Fill request reason',
        },
        {
          id: 'step-3',
          action: 'select_date',
          target: 'input#request-date',
          value: 'tomorrow',
          description: 'Select date',
        },
        {
          id: 'step-4',
          action: 'submit',
          target: 'button#btn-submit-request',
          description: 'Submit request',
        },
      ],
      assertions: [
        {
          id: 'assert-1',
          type: 'text_contains',
          target: 'table#requests-table',
          value: 'Aside agentic verified sprint',
          description: 'Created request appears in table',
        },
      ],
      evidence: {
        checkpoints: [
          {
            id: 'aside-verified',
            trigger: 'after_assertion',
            assertionId: 'assert-1',
            screenshot: true,
            description: 'Aside agentic proof screenshot',
          },
        ],
      },
    };

    const orchestrator = new FlowOrchestrator({ config });
    const result = await orchestrator.verifyFlow(flow, {
      executor: 'aside',
      headless: true,
    });

    expect(result.status).toBe('PROVEN');
    expect(result.executor).toBe('aside');
    expect(result.passedSteps).toBe(4);
    expect(result.passedAssertions).toBe(1);
    expect(result.checkpoints[0].evidence.length).toBeGreaterThanOrEqual(1);
  });
});
