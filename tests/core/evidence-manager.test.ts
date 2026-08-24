import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { EvidenceManager } from '../../src/core/evidence/evidence-manager.js';
import { VerificationResult } from '../../src/core/contracts/result.js';

describe('EvidenceManager', () => {
  let tmpDir: string;
  let manager: EvidenceManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowproof-test-'));
    manager = new EvidenceManager({ baseArtifactsDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should initialize execution context with nested directories', async () => {
    const context = await manager.createExecutionContext('test.flow', 'http://localhost:3000');

    expect(context.executionId).toContain('exec-test_flow');
    expect(context.evidenceDir).toContain('evidence');
    expect(context.tracesDir).toContain('trace');
    expect(context.logsDir).toContain('logs');

    const stat = await fs.stat(context.evidenceDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should record screenshots and return evidence items', async () => {
    const context = await manager.createExecutionContext('test.flow', 'http://localhost:3000');
    const dummyBuffer = Buffer.from('dummy image data');

    const item = await manager.recordScreenshot(context, 'checkpoint-1', dummyBuffer);
    expect(item.checkpointId).toBe('checkpoint-1');
    expect(item.path).toBe(path.join('evidence', 'checkpoint-1.png'));

    const fileContent = await fs.readFile(item.absolutePath);
    expect(fileContent.toString()).toBe('dummy image data');
  });

  it('should finalize and persist result.json and summary.md', async () => {
    const context = await manager.createExecutionContext('test.flow', 'http://localhost:3000');
    const mockResult: VerificationResult = {
      executionId: context.executionId,
      flowId: 'test.flow',
      flowName: 'Test Flow',
      status: 'PROVEN',
      executor: 'playwright',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 1500,
      totalSteps: 2,
      passedSteps: 2,
      totalAssertions: 1,
      passedAssertions: 1,
      checkpoints: [
        {
          id: 'cp-1',
          status: 'passed',
          evidence: [
            {
              id: 'ev-1',
              checkpointId: 'cp-1',
              type: 'screenshot',
              path: 'evidence/cp-1.png',
              absolutePath: path.join(context.evidenceDir, 'cp-1.png'),
              timestamp: new Date().toISOString(),
              status: 'passed',
            },
          ],
        },
      ],
      steps: [],
      assertions: [],
      artifacts: {
        resultJson: 'result.json',
        summaryMarkdown: 'summary.md',
        screenshots: ['evidence/cp-1.png'],
      },
    };

    const saved = await manager.finalizeExecutionResult(context, mockResult);
    expect(saved.status).toBe('PROVEN');

    const jsonOnDisk = await fs.readFile(path.join(context.artifactsDir, 'result.json'), 'utf-8');
    expect(JSON.parse(jsonOnDisk).flowId).toBe('test.flow');

    const mdOnDisk = await fs.readFile(path.join(context.artifactsDir, 'summary.md'), 'utf-8');
    expect(mdOnDisk).toContain('# Flowproof Verification: Test Flow');
    expect(mdOnDisk).toContain('PROVEN');
  });
});
