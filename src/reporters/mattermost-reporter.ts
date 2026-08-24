import path from 'node:path';
import { VerificationResult } from '../core/contracts/result.js';

export class MattermostReporter {
  /**
   * Format verification results into Mattermost-compatible Markdown.
   */
  public static formatReport(result: VerificationResult): string {
    const statusEmoji =
      result.status === 'PROVEN'
        ? ':white_check_mark: **PROVEN**'
        : result.status === 'BLOCKED'
          ? ':no_entry: **BLOCKED**'
          : ':x: **FAILED**';

    let msg = `### Flowproof Verification Report\n\n`;
    msg += `**Status:** ${statusEmoji}\n`;
    msg += `**Flow:** ${result.flowName} (\`${result.flowId}\`)\n`;
    msg += `**Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n`;
    msg += `**Executor:** \`${result.executor}\`\n\n`;

    msg += `**Checkpoints (${result.checkpoints.filter((c) => c.status === 'passed').length}/${result.checkpoints.length}):**\n`;
    for (const cp of result.checkpoints) {
      const icon = cp.status === 'passed' ? '✓' : cp.status === 'failed' ? '✗' : '○';
      msg += `- ${icon} ${cp.id}\n`;
    }
    msg += `\n`;

    const screenshotCount = result.artifacts.screenshots.length;
    const hasTrace = !!result.artifacts.trace;
    msg += `**Evidence Collected:**\n`;
    msg += `- ${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}\n`;
    if (hasTrace) {
      msg += `- 1 Playwright trace archive\n`;
    }
    msg += `\n`;

    if (result.diagnostic && result.status !== 'PROVEN') {
      msg += `**Diagnostic Analysis:**\n`;
      msg += `> **Classification:** \`${result.diagnostic.rootCauseClassification}\` (${(result.diagnostic.confidence * 100).toFixed(0)}% confidence)\n`;
      msg += `> ${result.diagnostic.summary}\n\n`;

      if (result.diagnostic.recommendations.length > 0) {
        msg += `**Recommended Actions:**\n`;
        for (const rec of result.diagnostic.recommendations) {
          msg += `- ${rec}\n`;
        }
      }
    }

    return msg.trim();
  }
}
