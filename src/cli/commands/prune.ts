import pc from 'picocolors';
import path from 'node:path';
import { AdapterRegistry } from '../../adapter/registry.js';
import { EvidenceManager } from '../../core/evidence/evidence-manager.js';

export interface PruneCommandOptions {
  days?: string;
  json?: boolean;
}

export async function pruneCommand(options: PruneCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const config = await AdapterRegistry.loadConfig(projectDir);
  const retentionDays = options.days ? parseInt(options.days, 10) : config.retentionDays || 14;

  const manager = new EvidenceManager({
    baseArtifactsDir: config.artifactsDir || path.join(projectDir, 'artifacts'),
    retentionDays,
  });

  const pruned = await manager.pruneOldArtifacts();

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          retentionDays,
          prunedCount: pruned.length,
          prunedDirectories: pruned,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(pc.bold(`\nArtifact Retention Pruning (older than ${retentionDays} days):`));
  if (pruned.length === 0) {
    console.log(pc.dim('No stale artifact directories found to prune.'));
  } else {
    for (const p of pruned) {
      console.log(`  ${pc.green('✓ Pruned:')} ${p}`);
    }
    console.log(pc.green(`\nTotal ${pruned.length} run(s) cleaned up.`));
  }
}
