import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRemoteWorkServer } from '../../examples/remote-work-app/server.js';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';
import { FlowOrchestrator } from '../../src/core/orchestrator/flow-orchestrator.js';
import { AdapterRegistry } from '../../src/adapter/registry.js';
import { flowsCommand } from '../../src/cli/commands/flows.js';
import { verifyCommand } from '../../src/cli/commands/verify.js';
import { inspectCommand } from '../../src/cli/commands/inspect.js';
import { evidenceCommand } from '../../src/cli/commands/evidence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const exampleAppDir = path.resolve(projectRoot, 'examples/remote-work-app');

describe('E2E Vertical Slice: Intentproof Verification', () => {
  let serverHandle: { server: any; url: string; close: () => Promise<void> };

  beforeAll(async () => {
    serverHandle = await createRemoteWorkServer(3344);
  });

  afterAll(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
  });

  it('should verify the Employee Creates Remote Request flow end-to-end', async () => {
    const flowPath = path.join(exampleAppDir, 'flows/employee.remote-request.create.yaml');
    const flow = await FlowLoader.loadFile(flowPath);

    const config = await AdapterRegistry.loadConfig(exampleAppDir, 'intentproof.config.ts');
    config.baseUrl = serverHandle.url;
    config.artifactsDir = path.join(exampleAppDir, 'artifacts');

    const orchestrator = new FlowOrchestrator({ config });

    const result = await orchestrator.verifyFlow(flow, {
      headless: true,
      timeoutMs: 15000,
    });

    expect(result.status).toBe('PROVEN');
    expect(result.flowId).toBe('employee.remote-request.create');
    expect(result.passedSteps).toBe(4);
    expect(result.passedAssertions).toBe(3);
    expect(result.checkpoints).toHaveLength(3);

    // Verify all checkpoints passed
    for (const cp of result.checkpoints) {
      expect(cp.status).toBe('passed');
      expect(cp.evidence.length).toBeGreaterThanOrEqual(1);
    }

    // Verify screenshot files on disk
    for (const cp of result.checkpoints) {
      for (const ev of cp.evidence) {
        const stat = await fs.stat(ev.absolutePath);
        expect(stat.isFile()).toBe(true);
        expect(stat.size).toBeGreaterThan(100); // Real image bytes
      }
    }

    // Verify result.json and summary.md on disk
    const resultJsonPath = path.join(config.artifactsDir, result.executionId, 'result.json');
    const summaryMdPath = path.join(config.artifactsDir, result.executionId, 'summary.md');

    const resultJson = JSON.parse(await fs.readFile(resultJsonPath, 'utf-8'));
    expect(resultJson.status).toBe('PROVEN');
    expect(resultJson.executionId).toBe(result.executionId);

    const summaryMd = await fs.readFile(summaryMdPath, 'utf-8');
    expect(summaryMd).toContain('PROVEN');
    expect(summaryMd).toContain('Employee Creates Remote Request');

    // Test CLI subcommands on the result
    const configPath = path.join(exampleAppDir, 'intentproof.config.ts');
    await flowsCommand({ json: true, config: configPath });
    await inspectCommand(result.executionId, { json: true, config: configPath });
    await evidenceCommand(result.executionId, { json: true, config: configPath });
  });
});
