import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { discoverCommand } from './commands/discover.js';
import { flowsCommand } from './commands/flows.js';
import { verifyCommand } from './commands/verify.js';
import { inspectCommand } from './commands/inspect.js';
import { evidenceCommand } from './commands/evidence.js';
import { pruneCommand } from './commands/prune.js';
import { createRecordCommand } from './commands/record.js';
import { doctorCommand } from './commands/doctor.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('intentproof')
    .description('AI-driven E2E verification orchestrator — Prove the user intent.')
    .version('0.1.0');

  program.addCommand(createRecordCommand());

  program
    .command('init')
    .description('Initialize Intentproof in the current repository with auto-detected config and starter flows')
    .option('--dir <dir>', 'Target project directory')
    .option('--base-url <url>', 'Override application base URL')
    .option('--force', 'Overwrite existing configuration')
    .option('--json', 'Output machine-readable JSON')
    .action(initCommand);

  program
    .command('discover')
    .description('Discover candidate user flows from repository code, specs, and routes')
    .option('--json', 'Output machine-readable JSON')
    .option('--save', 'Save discovered flows to flows/ directory')
    .option('--dir <dir>', 'Search directory relative to project root')
    .action(discoverCommand);

  program
    .command('flows')
    .description('List registered flow contracts and their statuses')
    .option('--config <path>', 'Custom path to intentproof.config.ts')
    .option('--json', 'Output machine-readable JSON')
    .action(flowsCommand);

  program
    .command('verify')
    .description('Execute flow verification and produce proof evidence')
    .option('--flow <id>', 'Verify a specific flow by ID')
    .option('--affected', 'Verify only flows affected by recent git changes')
    .option('--priority <level>', 'Filter flows by priority (critical | high | medium | low)')
    .option('--executor <executor>', 'Override executor (playwright | aside | hybrid)')
    .option('--headed', 'Run browser in headed (visible) mode')
    .option('--base-url <url>', 'Override target baseUrl')
    .option('--config <path>', 'Custom path to intentproof.config.ts')
    .option('--json', 'Output machine-readable JSON verification result')
    .option('--report-mattermost', 'Output formatted Mattermost report markdown')
    .action(verifyCommand);

  program
    .command('inspect <executionId>')
    .description('View AI diagnostic analysis and root cause classification for an execution')
    .option('--config <path>', 'Custom path to intentproof.config.ts')
    .option('--suggest-fix', 'Show a proposed flow update for stale selectors or assertions')
    .option('--json', 'Output machine-readable JSON')
    .action(inspectCommand);

  program
    .command('evidence <executionId>')
    .description('List and inspect visual evidence artifacts for an execution')
    .option('--config <path>', 'Custom path to intentproof.config.ts')
    .option('--json', 'Output machine-readable JSON')
    .action(evidenceCommand);

  program
    .command('prune')
    .description('Prune old artifact runs based on retention policy')
    .option('--days <days>', 'Override retention days')
    .option('--json', 'Output machine-readable JSON')
    .action(pruneCommand);

  program
    .command('doctor')
    .description('Validate configuration, flows, executors, browser, and project connectivity')
    .option('--config <path>', 'Custom path to intentproof.config.ts')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      await doctorCommand(options);
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  const cli = createCli();
  await cli.parseAsync(argv);
}
