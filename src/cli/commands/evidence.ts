import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AdapterRegistry } from '../../adapter/registry.js';
import { VerificationResult } from '../../core/contracts/result.js';

export interface EvidenceCommandOptions {
  json?: boolean;
  config?: string;
}

export async function evidenceCommand(executionId: string, options: EvidenceCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const config = await AdapterRegistry.loadConfig(projectDir, options.config);
  const artifactsBase = config.artifactsDir || path.join(projectDir, 'artifacts');
  const execDir = path.join(artifactsBase, executionId);
  const evidenceDir = path.join(execDir, 'evidence');

  try {
    const files = await fs.readdir(evidenceDir);
    const resultJsonPath = path.join(execDir, 'result.json');
    let result: VerificationResult | undefined;

    try {
      const content = await fs.readFile(resultJsonPath, 'utf-8');
      result = JSON.parse(content);
    } catch {}

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            executionId,
            directory: evidenceDir,
            evidenceFiles: files.map((f) => path.join(evidenceDir, f)),
            checkpoints: result?.checkpoints || [],
          },
          null,
          2
        )
      );
      return;
    }

    console.log(pc.bold(`\nEvidence Artifacts for ${pc.cyan(executionId)}:\n`));
    console.log(`Directory: ${pc.dim(evidenceDir)}\n`);

    if (files.length === 0) {
      console.log(pc.dim('No evidence files found in this run.'));
      return;
    }

    for (const f of files) {
      const fullPath = path.join(evidenceDir, f);
      const stat = await fs.stat(fullPath);
      const sizeKb = (stat.size / 1024).toFixed(1);
      console.log(`  📷 ${pc.bold(f)} ${pc.dim(`(${sizeKb} KB)`)}`);
      console.log(`     ${pc.cyan(fullPath)}`);
    }
    console.log('');
  } catch (err: any) {
    console.error(pc.red(`Could not list evidence for '${executionId}': ${err.message}`));
    process.exitCode = 1;
  }
}
