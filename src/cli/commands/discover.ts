import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { FlowMapper } from '../../ai/mapper/flow-mapper.js';
import { JsonReporter } from '../../reporters/json-reporter.js';

export interface DiscoverCommandOptions {
  json?: boolean;
  save?: boolean;
  dir?: string;
}

export async function discoverCommand(options: DiscoverCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const searchDir = options.dir ? path.resolve(projectDir, options.dir) : projectDir;

  const candidates = await FlowMapper.discoverFromProject(searchDir);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          count: candidates.length,
          candidates,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(pc.bold(`\nDiscovered ${candidates.length} candidate user flow(s):\n`));

  for (const c of candidates) {
    console.log(pc.bold(pc.cyan(`▶ ${c.flow.name}`)) + pc.dim(` (${c.flow.id})`));
    console.log(`  Priority:   ${pc.yellow(c.flow.priority)}`);
    console.log(`  Confidence: ${pc.green(`${(c.confidence * 100).toFixed(0)}%`)}`);
    console.log(`  Sources:    ${pc.dim(c.sources.join(', '))}`);
    console.log(`  Rationale:  ${c.rationale}`);
    console.log(`  Steps:      ${c.flow.steps.length} | Assertions: ${c.flow.assertions.length}`);
    console.log('');
  }

  if (options.save && candidates.length > 0) {
    const flowsDir = path.join(projectDir, 'flows');
    await fs.mkdir(flowsDir, { recursive: true });

    for (const c of candidates) {
      const fileName = `${c.flow.id}.flow.yaml`;
      const filePath = path.join(flowsDir, fileName);
      await fs.writeFile(filePath, YAML.stringify(c.flow), 'utf-8');
      console.log(pc.green(`Saved draft flow definition to ${pc.bold(path.relative(projectDir, filePath))}`));
    }
  }
}
