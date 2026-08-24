import { z } from 'zod';

export const VerificationStatusSchema = z.enum([
  'PROVEN',
  'FAILED',
  'BLOCKED',
  'INCONCLUSIVE',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const CheckpointStatusSchema = z.enum(['passed', 'failed', 'skipped']);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export interface EvidenceItem {
  id: string;
  checkpointId: string;
  type: 'screenshot' | 'trace' | 'video' | 'log' | 'dom_snapshot';
  path: string; // Relative to artifacts directory
  absolutePath: string;
  timestamp: string;
  status: CheckpointStatus;
  metadata?: Record<string, unknown>;
}

export interface CheckpointResult {
  id: string;
  description?: string;
  status: CheckpointStatus;
  evidence: EvidenceItem[];
  durationMs?: number;
  error?: string;
}

export interface StepResult {
  id: string;
  index: number;
  action: string;
  target?: string;
  value?: unknown;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface AssertionResult {
  id: string;
  index: number;
  type: string;
  target?: string;
  expected?: unknown;
  actual?: unknown;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface ArtifactManifest {
  resultJson: string;
  summaryMarkdown: string;
  screenshots: string[];
  trace?: string;
  video?: string;
  consoleLog?: string;
  networkLog?: string;
  orchestratorLog?: string;
}

export type RootCauseClassification =
  | 'application_regression'
  | 'stale_selector'
  | 'environment_failure'
  | 'flaky_timeout'
  | 'auth_failure'
  | 'unknown';

export interface DiagnosticAnalysis {
  summary: string;
  failureReason?: string;
  rootCauseClassification: RootCauseClassification;
  confidence: number;
  recommendations: string[];
  evidenceReferences: string[];
  affectedFeatures?: string[];
  stalePatchSuggestion?: string;
}

export interface ExecutionResult {
  executor: string;
  status: VerificationStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  steps: StepResult[];
  assertions: AssertionResult[];
  checkpoints: CheckpointResult[];
  error?: string;
  rawConsoleLogs?: Array<{ type: string; text: string; time: string }>;
  rawNetworkErrors?: Array<{ url: string; status: number; method: string; error?: string }>;
}

export interface VerificationResult {
  executionId: string;
  flowId: string;
  flowName: string;
  status: VerificationStatus;
  executor: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  totalSteps: number;
  passedSteps: number;
  totalAssertions: number;
  passedAssertions: number;
  checkpoints: CheckpointResult[];
  steps: StepResult[];
  assertions: AssertionResult[];
  artifacts: ArtifactManifest;
  error?: string;
  diagnostic?: DiagnosticAnalysis;
}
