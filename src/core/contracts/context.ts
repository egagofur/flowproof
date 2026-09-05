import type { CustomActionHandler } from '../../executors/playwright/actions.js';
import type { CustomAssertionHandler } from '../../executors/playwright/assertions.js';
import type { FlowTarget } from './flow.js';

export type BrowserExecutorType = 'playwright' | 'aside' | string;

export interface AuthCredentials {
  role: string;
  token?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  storageState?: Record<string, unknown>;
  headers?: Record<string, string>;
  customState?: Record<string, unknown>;
}

export interface ErrorPolicy {
  failOnPageError?: boolean;
  failOnConsoleError?: boolean;
  failOnHttp5xx?: boolean;
  failOnHttp4xx?: boolean;
  failOnRequestFailed?: boolean;
  failOnDangerNotification?: boolean;
  failOnUnexpectedDialog?: boolean;
  ignoredConsolePatterns?: string[];
  ignoredRequestPatterns?: string[];
  dangerNotificationTargets?: FlowTarget[];
}

export interface ExecutionOptions {
  headless?: boolean;
  timeoutMs?: number;
  recordTrace?: boolean;
  recordVideo?: boolean;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
  retentionDays?: number;
  executor?: BrowserExecutorType;
  errorPolicy?: ErrorPolicy;
  screenshotMaskTargets?: FlowTarget[];
}

export interface ExecutionContext {
  executionId: string;
  flowId: string;
  baseUrl: string;
  env: Record<string, string>;
  variables: Record<string, unknown>;
  secretVariableNames: string[];
  auth?: AuthCredentials;
  artifactsDir: string;
  evidenceDir: string;
  tracesDir: string;
  logsDir: string;
  options: ExecutionOptions;
  customActions?: Record<string, CustomActionHandler>;
  customAssertions?: Record<string, CustomAssertionHandler>;
}

export interface AuthResult {
  success: boolean;
  credentials?: AuthCredentials;
  error?: string;
}
