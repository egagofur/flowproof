import { FlowDefinition } from '../core/contracts/flow.js';
import { ExecutionContext } from '../core/contracts/context.js';
import { ExecutionResult } from '../core/contracts/result.js';

export type FailureCaptureResult = Pick<ExecutionResult, 'checkpoints' | 'artifactWarnings' | 'generatedArtifacts'>;

export interface BrowserExecutor {
  readonly name: string;
  initialize(context: ExecutionContext): Promise<void>;
  execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult>;
  captureFailureEvidence?(context: ExecutionContext): Promise<FailureCaptureResult>;
  cleanup(): Promise<void>;
}

export class ExecutorRegistry {
  private static executors: Map<string, () => BrowserExecutor> = new Map();

  public static register(name: string, factory: () => BrowserExecutor): void {
    this.executors.set(name.toLowerCase(), factory);
  }

  public static get(name: string): BrowserExecutor {
    const factory = this.executors.get(name.toLowerCase());
    if (!factory) {
      const available = Array.from(this.executors.keys()).join(', ');
      throw new Error(
        `Browser executor '${name}' is not registered. Available executors: ${available || 'none'}`
      );
    }
    return factory();
  }

  public static has(name: string): boolean {
    return this.executors.has(name.toLowerCase());
  }

  public static list(): string[] {
    return Array.from(this.executors.keys());
  }
}
