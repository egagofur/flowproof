import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { doctorCommand } from '../../src/cli/commands/doctor.js';

describe('intentproof doctor', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('validates a healthy project and emits machine-readable results', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-doctor-test-'));
    const flowsDir = path.join(tempDir, 'flows');
    await fs.mkdir(flowsDir);
    const configPath = path.join(tempDir, 'intentproof.config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({ baseUrl: 'http://localhost:3000' })
    );
    await fs.writeFile(
      path.join(flowsDir, 'homepage.yaml'),
      YAML.stringify({
        id: 'app.homepage',
        name: 'Homepage',
        steps: [{ action: 'navigate', target: '/' }],
        assertions: [{ type: 'element_visible', target: 'body' }],
      })
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await doctorCommand({ config: configPath, json: true });

    expect(result.healthy).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'config', status: 'pass' }),
        expect.objectContaining({ name: 'flows', status: 'pass' }),
        expect.objectContaining({ name: 'browser', status: 'pass' }),
        expect.objectContaining({ name: 'base-url', status: 'pass' }),
      ])
    );
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toEqual(result);
  });
});
