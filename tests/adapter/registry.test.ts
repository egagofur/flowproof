import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AdapterRegistry } from '../../src/adapter/registry.js';

describe('AdapterRegistry', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function createProject(): Promise<string> {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-config-test-'));
    tempDirs.push(projectDir);
    return projectDir;
  }

  it('resolves project directories relative to the config file', async () => {
    const projectDir = await createProject();
    const configDir = path.join(projectDir, 'config');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'intentproof.config.json'),
      JSON.stringify({
        baseUrl: 'http://localhost:3000',
        flowsDir: '../acceptance/flows',
        artifactsDir: '../output/artifacts',
      })
    );

    const config = await AdapterRegistry.loadConfig(
      projectDir,
      'config/intentproof.config.json'
    );

    expect(config.flowsDir).toBe(path.join(projectDir, 'acceptance/flows'));
    expect(config.artifactsDir).toBe(path.join(projectDir, 'output/artifacts'));
  });

  it('uses config-relative defaults when project directories are omitted', async () => {
    const projectDir = await createProject();
    const configDir = path.join(projectDir, 'config');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'intentproof.config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:3000' })
    );

    const config = await AdapterRegistry.loadConfig(
      projectDir,
      'config/intentproof.config.json'
    );

    expect(config.flowsDir).toBe(path.join(configDir, 'flows'));
    expect(config.artifactsDir).toBe(path.join(configDir, 'artifacts'));
  });

  it('reports an invalid discovered config instead of silently using defaults', async () => {
    const projectDir = await createProject();
    await fs.writeFile(path.join(projectDir, 'intentproof.config.json'), '{}');

    await expect(AdapterRegistry.loadConfig(projectDir)).rejects.toThrow(
      "missing required 'baseUrl'"
    );
  });

  it('loads TypeScript configs concurrently without leaking temporary files', async () => {
    const projectDir = await createProject();
    await fs.writeFile(
      path.join(projectDir, 'intentproof.config.ts'),
      "export default { baseUrl: 'http://localhost:3000' };"
    );

    await Promise.all(
      Array.from({ length: 4 }, () => AdapterRegistry.loadConfig(projectDir))
    );

    const cacheFiles = await fs.readdir(
      path.join(projectDir, 'node_modules', '.cache', 'intentproof')
    );
    expect(cacheFiles).toEqual([]);
  });
});
