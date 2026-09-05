import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ArtifactManifest,
  CheckpointResult,
  EvidenceItem,
  VerificationResult,
} from '../contracts/result.js';
import { ExecutionContext } from '../contracts/context.js';
import { SecretRedactor } from '../security/secret-redactor.js';
import { ArtifactStore } from './artifact-store.js';

export interface EvidenceManagerOptions {
  baseArtifactsDir?: string;
  retentionDays?: number;
  redactor?: SecretRedactor;
}

export class EvidenceManager {
  private baseArtifactsDir: string;
  private retentionDays: number;
  private redactor: SecretRedactor;

  constructor(options?: EvidenceManagerOptions) {
    this.baseArtifactsDir =
      options?.baseArtifactsDir ||
      process.env.INTENTPROOF_ARTIFACTS_DIR ||
      path.resolve(process.cwd(), 'artifacts');
    this.retentionDays =
      options?.retentionDays ??
      parseInt(process.env.INTENTPROOF_ARTIFACT_RETENTION_DAYS || '14', 10);
    this.redactor = options?.redactor || new SecretRedactor();
  }

  /**
   * Initialize a fresh execution context with organized directory paths.
   */
  public async createExecutionContext(
    flowId: string,
    baseUrl: string,
    options: ExecutionContext['options'] = {}
  ): Promise<ExecutionContext> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeFlowId = flowId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const executionId = `exec-${safeFlowId}-${timestamp}`;

    const executionArtifactsDir = path.join(this.baseArtifactsDir, executionId);
    const evidenceDir = path.join(executionArtifactsDir, 'evidence');
    const tracesDir = path.join(executionArtifactsDir, 'trace');
    const logsDir = path.join(executionArtifactsDir, 'logs');

    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.mkdir(tracesDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    return {
      executionId,
      flowId,
      baseUrl,
      env: process.env as Record<string, string>,
      variables: {},
      secretVariableNames: [],
      artifactsDir: executionArtifactsDir,
      evidenceDir,
      tracesDir,
      logsDir,
      options,
    };
  }

  /**
   * Record a screenshot evidence artifact for a checkpoint.
   */
  public async recordScreenshot(
    context: ExecutionContext,
    checkpointId: string,
    imageBuffer: Buffer,
    status: CheckpointResult['status'] = 'passed',
    suffix = ''
  ): Promise<EvidenceItem> {
    const filename = `${checkpointId}${suffix ? `-${suffix}` : ''}.png`;
    const absolutePath = path.join(context.evidenceDir, filename);
    const relativePath = path.join('evidence', filename);

    await fs.writeFile(absolutePath, imageBuffer);

    return {
      id: `evidence-${checkpointId}-${Date.now()}`,
      checkpointId,
      type: 'screenshot',
      path: relativePath,
      absolutePath,
      timestamp: new Date().toISOString(),
      status,
    };
  }

  /**
   * Save console logs and network logs to disk.
   */
  public async saveLogs(
    context: ExecutionContext,
    consoleLogs: Array<{ type: string; text: string; time: string }> = [],
    networkErrors: Array<{ url: string; status: number; method: string; error?: string }> = [],
    orchestratorLog = ''
  ): Promise<{ consoleLog?: string; networkLog?: string; orchestratorLog?: string }> {
    const result: { consoleLog?: string; networkLog?: string; orchestratorLog?: string } = {};

    {
      const consolePath = path.join(context.logsDir, 'console.log');
      const text = consoleLogs
        .map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${this.redactor.redact(l.text)}`)
        .join('\n');
      await fs.writeFile(consolePath, text, 'utf-8');
      result.consoleLog = path.join('logs', 'console.log');
    }

    {
      const networkPath = path.join(context.logsDir, 'network.log');
      const text = networkErrors
        .map(
          (n) =>
            `[${n.method}] ${this.redactor.redact(n.url)} -> ${n.status}${n.error ? ` (${n.error})` : ''}`
        )
        .join('\n');
      await fs.writeFile(networkPath, text, 'utf-8');
      result.networkLog = path.join('logs', 'network.log');
    }

    if (orchestratorLog) {
      const orchPath = path.join(context.logsDir, 'orchestrator.log');
      await fs.writeFile(orchPath, this.redactor.redact(orchestratorLog), 'utf-8');
      result.orchestratorLog = path.join('logs', 'orchestrator.log');
    }

    return result;
  }

  /**
   * Finalize and persist execution result and summary markdown.
   */
  public async finalizeExecutionResult(
    context: ExecutionContext,
    rawResult: VerificationResult
  ): Promise<VerificationResult> {
    // Redact sensitive details in the result
    const sanitizedResult: VerificationResult = this.redactor.redactObject(rawResult);

    // Persist result.json
    await ArtifactStore.saveResultJson(context.artifactsDir, sanitizedResult);

    // Persist summary.md
    await ArtifactStore.saveSummaryMarkdown(context.artifactsDir, sanitizedResult);

    return sanitizedResult;
  }

  /**
   * Prune artifact directories older than retention days.
   */
  public async pruneOldArtifacts(): Promise<string[]> {
    const pruned: string[] = [];
    try {
      const entries = await fs.readdir(this.baseArtifactsDir);
      const now = Date.now();
      const maxAgeMs = this.retentionDays * 24 * 60 * 60 * 1000;

      for (const entry of entries) {
        const fullPath = path.join(this.baseArtifactsDir, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          const age = now - stat.mtimeMs;
          if (age > maxAgeMs) {
            await fs.rm(fullPath, { recursive: true, force: true });
            pruned.push(entry);
          }
        }
      }
    } catch {
      // Base artifacts dir may not exist yet
    }
    return pruned;
  }
}
