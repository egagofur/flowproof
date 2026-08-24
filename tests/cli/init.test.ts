import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { initCommand } from '../../src/cli/commands/init.js';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';

describe('flowproof init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowproof-init-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should initialize a fresh project with config, starter flow, and .gitignore', async () => {
    await initCommand({ dir: tmpDir, baseUrl: 'http://localhost:4000' });

    // Check flowproof.config.ts
    const configPath = path.join(tmpDir, 'flowproof.config.ts');
    const configContent = await fs.readFile(configPath, 'utf-8');
    expect(configContent).toContain("http://localhost:4000");
    expect(configContent).toContain("defineConfig");

    // Check flows directory
    const flowsDir = path.join(tmpDir, 'flows');
    const flowFiles = await fs.readdir(flowsDir);
    expect(flowFiles.length).toBeGreaterThanOrEqual(1);

    // Verify starter flow is valid FlowDefinition
    const starterFlow = await FlowLoader.loadFile(path.join(flowsDir, flowFiles[0]));
    expect(starterFlow.id).toBeDefined();
    expect(starterFlow.steps.length).toBeGreaterThanOrEqual(1);
    expect(starterFlow.assertions.length).toBeGreaterThanOrEqual(1);

    // Check .gitignore
    const gitignorePath = path.join(tmpDir, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('artifacts/');
  });

  it('should detect Next.js framework when next is present in package.json', async () => {
    const pkg = {
      name: 'my-next-app',
      dependencies: { next: '14.0.0', react: '18.0.0' },
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg), 'utf-8');

    await initCommand({ dir: tmpDir });

    const configContent = await fs.readFile(path.join(tmpDir, 'flowproof.config.ts'), 'utf-8');
    expect(configContent).toContain('SessionAuthStrategy');
    expect(configContent).toContain('3000');
  });
});
