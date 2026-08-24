import { Command } from 'commander';
import pc from 'picocolors';
import { AdapterRegistry } from '../../adapter/registry.js';
import { FlowRecorder } from '../../ai/recorder/flow-recorder.js';

export function createRecordCommand(): Command {
  const command = new Command('record');

  command
    .description('Interactively record user or agent browser actions and generate a YAML flow contract')
    .option('-f, --flow <flowId>', 'ID of the flow to generate (e.g. app.feature.action)')
    .option('-n, --name <flowName>', 'Human-readable name of the flow')
    .option('-u, --url <url>', 'Starting URL or path for recording', '/')
    .option('-r, --role <role>', 'Role to authenticate as before recording', 'user')
    .option('-o, --output <path>', 'Custom path to write the YAML flow definition')
    .option('-c, --config <path>', 'Path to flowproof.config.ts')
    .action(async (options) => {
      try {
        const config = await AdapterRegistry.loadConfig(process.cwd(), options.config);
        const recorder = new FlowRecorder(config);

        await recorder.recordSession({
          flowId: options.flow,
          flowName: options.name,
          initialUrl: options.url,
          outputPath: options.output,
          role: options.role,
        });
      } catch (err: any) {
        console.error(pc.red(`\n❌ [Flowproof Record Error] ${err.message}\n`));
        process.exit(1);
      }
    });

  return command;
}
