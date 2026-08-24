import pc from 'picocolors';
import path from 'node:path';
import { AdapterRegistry } from '../../adapter/registry.js';
import { FlowLoader } from '../../core/parser/flow-loader.js';
import { JsonReporter } from '../../reporters/json-reporter.js';

export interface FlowsCommandOptions {
  json?: boolean;
  config?: string;
}

export async function flowsCommand(options: FlowsCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const config = await AdapterRegistry.loadConfig(projectDir, options.config);
  const flowsDir = config.flowsDir || path.join(projectDir, 'flows');

  const loaded = await FlowLoader.loadDirectory(flowsDir);
  const validFlows = loaded.filter((l) => l.flow).map((l) => l.flow!);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          flowsDir,
          total: validFlows.length,
          flows: validFlows,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(pc.bold(`\nRegistered Flows in ${pc.cyan(path.relative(projectDir, flowsDir) || '.')}:\n`));

  if (validFlows.length === 0) {
    console.log(pc.dim('No flow definitions found. Run `flowproof discover --save` to create initial flows.'));
    return;
  }

  for (const f of validFlows) {
    const priorityColor =
      f.priority === 'critical'
        ? pc.red
        : f.priority === 'high'
          ? pc.yellow
          : pc.blue;

    console.log(pc.bold(`• ${f.name}`) + pc.dim(` [${f.id}]`));
    console.log(`  Priority:     ${priorityColor(f.priority)}`);
    console.log(`  Roles:        ${f.roles.length > 0 ? f.roles.join(', ') : pc.dim('none')}`);
    console.log(`  Tags:         ${f.tags.length > 0 ? f.tags.join(', ') : pc.dim('none')}`);
    console.log(`  Steps:        ${f.steps.length}`);
    console.log(`  Assertions:   ${f.assertions.length}`);
    console.log(`  Checkpoints:  ${f.evidence.checkpoints.length}`);
    console.log('');
  }
}
