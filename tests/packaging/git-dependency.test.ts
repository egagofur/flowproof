import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intentproof-pack-'));
    try {
      execFileSync(
        'npm',
        ['pack', '--ignore-scripts=true', '--pack-destination', packDir],
        { cwd: projectRoot, stdio: 'ignore' }
      );
      const tarballs = fs.readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
      expect(tarballs).toHaveLength(1);

      const files = execFileSync('tar', ['-tf', path.join(packDir, tarballs[0])], {
        encoding: 'utf8',
      }).split(/\r?\n/);
      expect(files).toContain('package/bin/intentproof.js');
      expect(files).toContain('package/dist/cli/index.js');
      expect(files).toContain('package/dist/index.d.ts');
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  }, 60_000);
});
