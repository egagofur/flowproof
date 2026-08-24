import path from 'node:path';
import fs from 'node:fs/promises';
import { BrowserExecutor } from '../base.js';
import { FlowDefinition, FlowEvidenceCheckpoint } from '../../core/contracts/flow.js';
import { ExecutionContext } from '../../core/contracts/context.js';
import {
  AssertionResult,
  CheckpointResult,
  EvidenceItem,
  ExecutionResult,
  StepResult,
  VerificationStatus,
} from '../../core/contracts/result.js';
import { AsideDriver } from './aside-driver.js';

export class AsideExecutor implements BrowserExecutor {
  public readonly name = 'aside';
  private driver: AsideDriver;

  constructor(customDriver?: AsideDriver) {
    this.driver = customDriver || new AsideDriver();
  }

  public async initialize(context: ExecutionContext): Promise<void> {
    await this.driver.initialize(context);
  }

  public async execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date().toISOString();
    const startMs = Date.now();

    const stepResults: StepResult[] = [];
    const assertionResults: AssertionResult[] = [];
    const checkpointMap = new Map<string, CheckpointResult>();

    for (const cp of flow.evidence.checkpoints) {
      checkpointMap.set(cp.id, {
        id: cp.id,
        description: cp.description,
        status: 'skipped',
        evidence: [],
      });
    }

    let overallStatus: VerificationStatus = 'PROVEN';
    let fatalError: string | undefined;
    const allTrajectories: Array<{ type: string; text: string; time: string }> = [];

    try {
      // 1. Check preconditions
      for (const precondition of flow.preconditions) {
        if (precondition.route) {
          const targetUrl = precondition.route.startsWith('http')
            ? precondition.route
            : new URL(precondition.route, context.baseUrl).toString();
          const page = this.driver.getPage();
          if (page) {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
          }
        }
      }

      // 2. Execute Steps
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        const stepStartMs = Date.now();
        const stepId = step.id || `step-${i + 1}`;

        const stepResult = await this.driver.executeStep(step, context);
        stepResult.trajectory.forEach((t) =>
          allTrajectories.push({ type: 'agent_trajectory', text: t, time: new Date().toISOString() })
        );

        if (stepResult.success) {
          stepResults.push({
            id: stepId,
            index: i,
            action: step.action,
            target: step.target,
            value: step.value,
            status: 'passed',
            durationMs: Date.now() - stepStartMs,
          });

          // Checkpoints after step
          await this.captureCheckpoints(
            flow.evidence.checkpoints.filter(
              (cp) =>
                cp.trigger === 'after_step' &&
                (cp.stepId === stepId || cp.stepIndex === i)
            ),
            checkpointMap,
            context,
            'passed',
            stepResult.screenshotBuffer
          );
        } else {
          const stepErr = stepResult.error || `Aside step ${i + 1} (${step.action}) failed`;
          stepResults.push({
            id: stepId,
            index: i,
            action: step.action,
            target: step.target,
            value: step.value,
            status: 'failed',
            durationMs: Date.now() - stepStartMs,
            error: stepErr,
          });

          if (!step.optional) {
            overallStatus = 'FAILED';
            fatalError = stepErr;
            break;
          }
        }
      }

      // 3. Evaluate Assertions
      if (overallStatus !== 'FAILED') {
        for (let j = 0; j < flow.assertions.length; j++) {
          const assertion = flow.assertions[j];
          const assertStartMs = Date.now();
          const assertionId = assertion.id || `assert-${j + 1}`;

          const assertResult = await this.driver.evaluateAssertion(assertion, context);
          assertResult.trajectory.forEach((t) =>
            allTrajectories.push({ type: 'agent_assertion', text: t, time: new Date().toISOString() })
          );

          if (assertResult.success) {
            assertionResults.push({
              id: assertionId,
              index: j,
              type: assertion.type,
              target: assertion.target,
              expected: assertion.value,
              actual: assertResult.actual,
              status: 'passed',
              durationMs: Date.now() - assertStartMs,
            });

            await this.captureCheckpoints(
              flow.evidence.checkpoints.filter(
                (cp) =>
                  cp.trigger === 'after_assertion' &&
                  (cp.assertionId === assertionId || cp.assertionIndex === j)
              ),
              checkpointMap,
              context,
              'passed',
              assertResult.screenshotBuffer
            );
          } else {
            overallStatus = 'FAILED';
            const errMsg = assertResult.error || `Assertion ${assertionId} failed`;
            assertionResults.push({
              id: assertionId,
              index: j,
              type: assertion.type,
              target: assertion.target,
              expected: assertion.value,
              actual: assertResult.actual,
              status: 'failed',
              durationMs: Date.now() - assertStartMs,
              error: errMsg,
            });
            if (!fatalError) fatalError = errMsg;
          }
        }
      }
    } catch (err: any) {
      overallStatus = 'BLOCKED';
      fatalError = `Aside execution blocked: ${err.message}`;
    }

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    return {
      executor: this.name,
      status: overallStatus,
      startTime,
      endTime,
      durationMs,
      steps: stepResults,
      assertions: assertionResults,
      checkpoints: Array.from(checkpointMap.values()),
      error: fatalError,
      rawConsoleLogs: allTrajectories,
    };
  }

  private async captureCheckpoints(
    checkpoints: FlowEvidenceCheckpoint[],
    checkpointMap: Map<string, CheckpointResult>,
    context: ExecutionContext,
    status: CheckpointResult['status'],
    imageBuffer?: Buffer
  ): Promise<void> {
    for (const cp of checkpoints) {
      const existing = checkpointMap.get(cp.id) || {
        id: cp.id,
        description: cp.description,
        status,
        evidence: [],
      };

      if (cp.screenshot) {
        let buffer = imageBuffer;
        const page = this.driver.getPage();
        if (!buffer && page) {
          buffer = await page.screenshot().catch(() => undefined);
        }

        if (buffer) {
          const filename = `${cp.id}.png`;
          const filePath = path.join(context.evidenceDir, filename);
          await fs.writeFile(filePath, buffer);

          const evidenceItem: EvidenceItem = {
            id: `evidence-${cp.id}-${Date.now()}`,
            checkpointId: cp.id,
            type: 'screenshot',
            path: path.join('evidence', filename),
            absolutePath: filePath,
            timestamp: new Date().toISOString(),
            status,
          };

          existing.evidence.push(evidenceItem);
          existing.status = status;
        }
      }

      checkpointMap.set(cp.id, existing);
    }
  }

  public async cleanup(): Promise<void> {
    await this.driver.cleanup();
  }
}
