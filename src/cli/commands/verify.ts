import pc from 'picocolors';
import path from 'node:path';
import { AdapterRegistry } from '../../adapter/registry.js';
import { FlowLoader } from '../../core/parser/flow-loader.js';
import { FlowOrchestrator } from '../../core/orchestrator/flow-orchestrator.js';
import { ChangeImpactAnalyzer } from '../../ai/impact/impact-analyzer.js';
import { ConsoleReporter } from '../../reporters/console-reporter.js';
import { JsonReporter } from '../../reporters/json-reporter.js';
import { MattermostReporter } from '../../reporters/mattermost-reporter.js';
import { VerificationResult } from '../../core/contracts/result.js';
import { FlowDefinition } from '../../core/contracts/flow.js';

export interface VerifyCommandOptions {
  flow?: string;
  affected?: boolean;
  priority?: string;
  executor?: string;
  headed?: boolean;
  json?: boolean;
  reportMattermost?: boolean;
  config?: string;
  baseUrl?: string;
  baseRef?: string;
}

export async function verifyCommand(options: VerifyCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const config = await AdapterRegistry.loadConfig(projectDir, options.config);

  if (options.baseUrl) {
    config.baseUrl = options.baseUrl;
  }

  const flowsDir = config.flowsDir || path.join(projectDir, 'flows');
  const loaded = await FlowLoader.loadDirectory(flowsDir);
  let targetFlows = loaded.filter((l) => l.flow).map((l) => l.flow!);

  if (targetFlows.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: `No flows found in ${flowsDir}` }, null, 2));
    } else {
      console.error(pc.red(`No flows found in ${flowsDir}`));
    }
    process.exitCode = 1;
    return;
  }

  // 1. Filter by specific flow ID
  if (options.flow) {
    const single = targetFlows.find((f) => f.id === options.flow);
    if (!single) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Flow '${options.flow}' not found` }, null, 2));
      } else {
        console.error(pc.red(`Flow '${options.flow}' not found in ${flowsDir}`));
      }
      process.exitCode = 1;
      return;
    }
    targetFlows = [single];
  }

  // 2. Filter by affected (Git diff)
  if (options.affected) {
    const changedFiles = await ChangeImpactAnalyzer.getChangedFiles(projectDir, options.baseRef);
    const affected = ChangeImpactAnalyzer.analyzeImpact(targetFlows, changedFiles);

    if (affected.length === 0) {
      if (!options.json) {
        console.log(pc.yellow('\nNo flows affected by current changes.'));
      } else {
        console.log(JSON.stringify({ total: 0, results: [] }, null, 2));
      }
      return;
    }

    if (!options.json) {
      console.log(pc.bold(`\nIdentified ${affected.length} affected flow(s) from git changes:\n`));
      for (const aff of affected) {
        console.log(`  ${pc.cyan('•')} ${aff.flow.name} (${aff.flow.id}) - ${pc.dim(aff.reason)}`);
      }
      console.log('');
    }

    targetFlows = affected.map((a) => a.flow);
  }

  // 3. Filter by priority
  if (options.priority) {
    const p = options.priority.toLowerCase();
    targetFlows = targetFlows.filter((f) => f.priority.toLowerCase() === p);
    if (targetFlows.length === 0) {
      if (!options.json) {
        console.log(pc.yellow(`No flows matched priority '${options.priority}'`));
      }
      return;
    }
  }

  // 4. Execute verification
  const orchestrator = new FlowOrchestrator({ config });
  const results: VerificationResult[] = [];
  let anyFailed = false;

  for (const flow of targetFlows) {
    const res = await orchestrator.verifyFlow(flow, {
      executor: options.executor,
      headless: options.headed ? false : config.options?.headless,
    });

    results.push(res);

    if (res.status !== 'PROVEN') {
      anyFailed = true;
    }

    if (!options.json) {
      ConsoleReporter.report(res);
      if (options.reportMattermost) {
        console.log(pc.bold('\nMattermost Report Format:'));
        console.log(pc.dim('----------------------------------------'));
        console.log(MattermostReporter.formatReport(res));
        console.log(pc.dim('----------------------------------------\n'));
      }
    }
  }

  if (options.json) {
    console.log(JsonReporter.format(results.length === 1 ? results[0] : (results as any)));
  }

  if (anyFailed) {
    process.exitCode = 1;
  }
}
