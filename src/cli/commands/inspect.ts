import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AdapterRegistry } from '../../adapter/registry.js';
import { VerificationResult } from '../../core/contracts/result.js';

export interface InspectCommandOptions {
  json?: boolean;
  config?: string;
  suggestFix?: boolean;
}

export async function inspectCommand(executionId: string, options: InspectCommandOptions): Promise<void> {
  const projectDir = process.cwd();
  const config = await AdapterRegistry.loadConfig(projectDir, options.config);
  const artifactsBase = config.artifactsDir || path.join(projectDir, 'artifacts');
  const execDir = path.join(artifactsBase, executionId);
  const resultJsonPath = path.join(execDir, 'result.json');

  try {
    const content = await fs.readFile(resultJsonPath, 'utf-8');
    const result: VerificationResult = JSON.parse(content);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(pc.bold(`\nIntentproof Inspection: ${result.executionId}`));
    console.log(pc.dim('────────────────────────────────────────'));
    console.log(`Flow:       ${pc.bold(result.flowName)} (${result.flowId})`);
    console.log(`Status:     ${result.status === 'PROVEN' ? pc.green(result.status) : pc.red(result.status)}`);
    console.log(`Duration:   ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`Executor:   ${result.executor}`);

    if (result.diagnostic) {
      console.log(pc.bold('\nDiagnostic Root Cause:'));
      console.log(`  Classification: ${pc.yellow(result.diagnostic.rootCauseClassification)}`);
      console.log(`  Confidence:     ${pc.green(`${(result.diagnostic.confidence * 100).toFixed(0)}%`)}`);
      console.log(`  Summary:        ${result.diagnostic.summary}`);
      if (result.diagnostic.failureReason) {
        console.log(`  Failure Reason: ${pc.red(result.diagnostic.failureReason)}`);
      }
      if (result.diagnostic.recommendations.length > 0) {
        console.log(`\n  Recommendations:`);
        for (const rec of result.diagnostic.recommendations) {
          console.log(`    ${pc.dim('•')} ${rec}`);
        }
      }
    }

    if (options.suggestFix) {
      const suggestion = result.diagnostic?.staleSuggestion;
      console.log(pc.bold('\nStale Flow Suggestion:'));
      if (!suggestion) {
        console.log(`  ${pc.dim('No stale selector or assertion change was detected.')}`);
      } else {
        console.log(`  Confidence: ${pc.green(`${(suggestion.confidence * 100).toFixed(0)}%`)}`);
        if (suggestion.reason) {
          console.log(`  Reason:     ${suggestion.reason}`);
        }
        for (const change of suggestion.changes || []) {
          console.log(`\n  ${pc.bold(`${change.subject} ${change.id}`)}`);
          console.log(`  Current:   ${pc.red(change.current)}`);
          console.log(`  Suggested: ${pc.green(change.suggested)}`);
        }
        if (suggestion.proposedPatch) {
          console.log(pc.bold('\nProposed flow YAML:\n'));
          console.log(suggestion.proposedPatch);
        }
      }
    }

    console.log(pc.bold('\nArtifacts:'));
    console.log(`  Result JSON:    ${pc.cyan(path.join(execDir, 'result.json'))}`);
    console.log(`  Summary MD:     ${pc.cyan(path.join(execDir, 'summary.md'))}`);
    if (result.artifacts.trace) {
      console.log(`  Trace:          ${pc.cyan(path.join(execDir, result.artifacts.trace))}`);
    }
    if (result.artifacts.screenshots.length > 0) {
      console.log(`  Screenshots (${result.artifacts.screenshots.length}):`);
      for (const s of result.artifacts.screenshots) {
        console.log(`    ${pc.dim('└─')} 📷 ${pc.cyan(path.join(execDir, s))}`);
      }
    }
    console.log(pc.dim('────────────────────────────────────────\n'));
  } catch (err: any) {
    console.error(pc.red(`Could not inspect execution '${executionId}': ${err.message}`));
    process.exitCode = 1;
  }
}
