import pc from 'picocolors';
import { VerificationResult } from '../core/contracts/result.js';

export class ConsoleReporter {
  public static report(result: VerificationResult): void {
    const isProven = result.status === 'PROVEN';
    const isBlocked = result.status === 'BLOCKED';
    const isFailed = result.status === 'FAILED';

    const statusBadge = isProven
      ? pc.bgGreen(pc.black(' PROVEN '))
      : isBlocked
        ? pc.bgYellow(pc.black(' BLOCKED '))
        : pc.bgRed(pc.white(' FAILED '));

    console.log('');
    console.log(pc.bold('FLOWPROOF VERIFICATION'));
    console.log(pc.dim('────────────────────────────────────────'));
    console.log(`Status:      ${statusBadge}`);
    console.log(`Flow:        ${pc.bold(result.flowName)} ${pc.dim(`(${result.flowId})`)}`);
    console.log(`Executor:    ${pc.cyan(result.executor)}`);
    console.log(`Duration:    ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`Steps:       ${pc.green(`${result.passedSteps}/${result.totalSteps}`)} passed`);
    console.log(`Assertions:  ${pc.green(`${result.passedAssertions}/${result.totalAssertions}`)} passed`);
    console.log(pc.dim('────────────────────────────────────────'));

    if (result.checkpoints.length > 0) {
      console.log(pc.bold('\nCheckpoints & Evidence:'));
      for (const cp of result.checkpoints) {
        const icon = cp.status === 'passed' ? pc.green('✓') : cp.status === 'failed' ? pc.red('✗') : pc.dim('○');
        const evCount = cp.evidence.length > 0 ? pc.dim(`(${cp.evidence.length} artifact(s))`) : pc.dim('(no screenshot)');
        console.log(`  ${icon} ${pc.bold(cp.id)} ${evCount}`);
        for (const ev of cp.evidence) {
          console.log(`    ${pc.dim('└─')} 📷 ${pc.cyan(ev.path)}`);
        }
      }
    }

    if (result.artifacts.trace) {
      console.log(`\n  📦 Trace: ${pc.cyan(result.artifacts.trace)}`);
    }

    if (result.diagnostic && !isProven) {
      console.log(pc.bold('\nAI Diagnostic Analysis:'));
      console.log(`  Classification: ${pc.yellow(result.diagnostic.rootCauseClassification)} (Confidence: ${(result.diagnostic.confidence * 100).toFixed(0)}%)`);
      console.log(`  Summary:        ${result.diagnostic.summary}`);
      if (result.diagnostic.recommendations.length > 0) {
        console.log(`  Next Actions:`);
        for (const rec of result.diagnostic.recommendations) {
          console.log(`    ${pc.dim('•')} ${rec}`);
        }
      }
    }

    console.log(pc.dim('────────────────────────────────────────\n'));
  }
}
