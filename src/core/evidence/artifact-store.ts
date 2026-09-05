import fs from 'node:fs/promises';
import path from 'node:path';
import { VerificationResult } from '../contracts/result.js';

export class ArtifactStore {
  /**
   * Save normalized verification result JSON.
   */
  public static async saveResultJson(
    artifactsDir: string,
    result: VerificationResult
  ): Promise<string> {
    const filePath = path.join(artifactsDir, 'result.json');
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Generate human-readable Markdown summary.
   */
  public static generateSummaryMarkdown(result: VerificationResult): string {
    const statusEmoji =
      result.status === 'PROVEN'
        ? '✅ PROVEN'
        : result.status === 'FAILED'
          ? '❌ FAILED'
          : result.status === 'BLOCKED'
            ? '🚫 BLOCKED'
            : '❓ INCONCLUSIVE';

    let md = `# Intentproof Verification: ${result.flowName}\n\n`;
    md += `**Status:** ${statusEmoji}\n`;
    md += `**Flow ID:** \`${result.flowId}\`\n`;
    md += `**Executor:** \`${result.executor}\`\n`;
    md += `**Execution ID:** \`${result.executionId}\`\n`;
    md += `**Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n\n`;

    md += `## Checkpoints Summary\n\n`;
    if (result.checkpoints.length === 0) {
      md += `*No checkpoints defined.*\n\n`;
    } else {
      md += `| Checkpoint | Status | Evidence Count | Duration |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      for (const cp of result.checkpoints) {
        const cpStatus = cp.status === 'passed' ? '✅ Passed' : cp.status === 'failed' ? '❌ Failed' : '⏭️ Skipped';
        const evidenceLinks = cp.evidence
          .map((e) => `[${path.basename(e.path)}](${e.path})`)
          .join(', ') || 'None';
        md += `| **${cp.id}** | ${cpStatus} | ${evidenceLinks} | ${cp.durationMs ? `${cp.durationMs}ms` : '-'} |\n`;
      }
      md += `\n`;
    }

    if (result.steps.length > 0) {
      md += `## Steps Executed\n\n`;
      for (const step of result.steps) {
        const sStatus = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '○';
        const targetStr = step.target ? ` on \`${step.target}\`` : '';
        const valueStr = step.value !== undefined ? ` with value: \`${JSON.stringify(step.value)}\`` : '';
        md += `- [${sStatus}] **Step ${step.index + 1} (${step.action})**${targetStr}${valueStr} (${step.durationMs}ms)\n`;
        if (step.error) {
          md += `  > **Error:** ${step.error}\n`;
        }
      }
      md += `\n`;
    }

    if (result.assertions.length > 0) {
      md += `## Assertions Evaluated\n\n`;
      for (const assertion of result.assertions) {
        const aStatus = assertion.status === 'passed' ? '✓' : assertion.status === 'failed' ? '✗' : '○';
        const targetStr = assertion.target ? ` on \`${assertion.target}\`` : '';
        md += `- [${aStatus}] **${assertion.id} (${assertion.type})**${targetStr} (${assertion.durationMs}ms)\n`;
        if (assertion.error) {
          md += `  > **Failure:** ${assertion.error}\n`;
        }
      }
      md += `\n`;
    }

    if (result.diagnostic) {
      md += `## AI Diagnostic Analysis\n\n`;
      md += `**Classification:** \`${result.diagnostic.rootCauseClassification}\` (Confidence: ${(result.diagnostic.confidence * 100).toFixed(0)}%)\n\n`;
      md += `${result.diagnostic.summary}\n\n`;

      if (result.diagnostic.recommendations.length > 0) {
        md += `### Recommendations\n\n`;
        for (const rec of result.diagnostic.recommendations) {
          md += `- ${rec}\n`;
        }
        md += `\n`;
      }
    }

    if (result.artifacts.screenshots.length > 0 || result.artifacts.trace) {
      md += `## Evidence Artifacts\n\n`;
      for (const shot of result.artifacts.screenshots) {
        md += `- 📷 Screenshot: [${path.basename(shot)}](${shot})\n`;
      }
      if (result.artifacts.trace) {
        md += `- 📦 Playwright Trace: [${path.basename(result.artifacts.trace)}](${result.artifacts.trace})\n`;
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Save summary markdown file.
   */
  public static async saveSummaryMarkdown(
    artifactsDir: string,
    result: VerificationResult
  ): Promise<string> {
    const filePath = path.join(artifactsDir, 'summary.md');
    const content = this.generateSummaryMarkdown(result);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }
}
