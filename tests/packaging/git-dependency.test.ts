import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '../..');

describe('Git dependency packaging', () => {
  it('builds the ignored dist payload during prepare and packages a working CLI', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.prepare).toBe('npm run build');

    execFileSync('npm', ['run', 'prepare', '--silent'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    for (const relativePath of ['dist/index.js', 'dist/index.d.ts', 'dist/cli/index.js', 'bin/intentproof.js']) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }

    const help = execFileSync(process.execPath, ['bin/intentproof.js', '--help'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const generateHelp = execFileSync(
      process.execPath,
      ['bin/intentproof.js', 'generate', '--help'],
      { cwd: projectRoot, encoding: 'utf8' }
    );
    expect(help).toContain('Usage: intentproof');
    expect(generateHelp).toContain('Usage: intentproof generate');

    const packOutput = execFileSync(
      'npm',
      ['pack', '--dry-run', '--ignore-scripts', '--json'],
      { cwd: projectRoot, encoding: 'utf8' }
    );
    const packed = JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>;
    const files = packed[0].files.map((file) => file.path);
    expect(files).toContain('bin/intentproof.js');
    expect(files).toContain('dist/cli/index.js');
    expect(files).toContain('dist/index.d.ts');
  }, 30_000);
});
