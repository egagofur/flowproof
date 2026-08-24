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

export interface ExecutionOptions {
  headless?: boolean;
  timeoutMs?: number;
  recordTrace?: boolean;
  recordVideo?: boolean;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
  retentionDays?: number;
  executor?: BrowserExecutorType;
}

export interface ExecutionContext {
  executionId: string;
  flowId: string;
  baseUrl: string;
  env: Record<string, string>;
  auth?: AuthCredentials;
  artifactsDir: string;
  evidenceDir: string;
  tracesDir: string;
  logsDir: string;
  options: ExecutionOptions;
}

export interface AuthResult {
  success: boolean;
  credentials?: AuthCredentials;
  error?: string;
}
