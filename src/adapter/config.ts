import { AuthStrategy } from './auth/base.js';
import { CustomActionHandler } from '../executors/playwright/actions.js';
import { CustomAssertionHandler } from '../executors/playwright/assertions.js';
import { BrowserExecutorType, ExecutionOptions } from '../core/contracts/context.js';
import { VerificationResult } from '../core/contracts/result.js';
import { FlowDefinition } from '../core/contracts/flow.js';

export interface FlowLifecycleContext {
  registerCleanup(cleanup: () => Promise<void> | void): void;
}

export interface ProjectHooks {
  beforeAll?: () => Promise<void> | void;
  afterAll?: () => Promise<void> | void;
  beforeFlow?: (flow: FlowDefinition, lifecycle: FlowLifecycleContext) => Promise<void> | void;
  afterFlow?: (flow: FlowDefinition, result: VerificationResult, lifecycle: FlowLifecycleContext) => Promise<void> | void;
}

export interface ProjectConfig {
  baseUrl: string;
  flowsDir?: string;
  artifactsDir?: string;
  defaultExecutor?: BrowserExecutorType;
  options?: ExecutionOptions;
  auth?: Record<string, AuthStrategy>;
  customActions?: Record<string, CustomActionHandler>;
  customAssertions?: Record<string, CustomAssertionHandler>;
  routes?: Record<string, string>;
  variables?: Record<string, unknown> | ((flow: FlowDefinition) => Promise<Record<string, unknown>> | Record<string, unknown>);
  retentionDays?: number;
  hooks?: ProjectHooks;
}

export type IntentproofConfig = ProjectConfig;

export function defineConfig(config: ProjectConfig): ProjectConfig {
  return config;
}
