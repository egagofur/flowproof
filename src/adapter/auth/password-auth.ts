import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { AuthStrategy } from './base.js';
import type { AuthCredentials, AuthResult, ExecutionContext } from '../../core/contracts/context.js';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface PasswordAuthOptions {
  loginUrl: string;
  usernameField?: string;
  passwordField?: string;
  submitField?: string;
  credentials: (role: string) => Promise<{ username: string; password: string }> | { username: string; password: string };
  validateSuccess?: (page: Page) => Promise<void>;
  storageStatePath?: string | ((role: string) => string);
}

export class PasswordAuthStrategy implements AuthStrategy {
  public readonly name = 'PasswordAuth';
  private memoryCache = new Map<string, AuthCredentials>();

  constructor(private options: PasswordAuthOptions) {}

  public async authenticate(context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const memory = this.memoryCache.get(role);
      if (memory) return { success: true, credentials: memory };

      const cachePath = this.cachePath(role);
      if (cachePath) {
        const cached = await this.readCache(cachePath);
        if (cached && await this.validateCachedState(context, cached)) {
          const credentials = this.toCredentials(role, cached);
          this.memoryCache.set(role, credentials);
          return { success: true, credentials };
        }
      }

      const creds = await this.options.credentials(role);
      if (!creds.username || !creds.password) {
        return { success: false, error: `Missing username or password credentials for role '${role}'` };
      }

      const browser = await chromium.launch({ headless: true });
      const browserContext = await browser.newContext();
      const page = await browserContext.newPage();
      try {
        await page.goto(this.loginUrl(context), { waitUntil: 'domcontentloaded' });
        await page.fill(this.options.usernameField || 'input[name="username"], input[name="email"], input[type="email"]', creds.username);
        await page.fill(this.options.passwordField || 'input[name="password"], input[type="password"]', creds.password);
        await page.click(this.options.submitField || 'button[type="submit"], input[type="submit"]');
        if (this.options.validateSuccess) await this.options.validateSuccess(page);
        else await page.waitForLoadState('networkidle').catch(() => undefined);

        const storageState = await browserContext.storageState();
        const credentials = this.toCredentials(role, storageState);
        this.memoryCache.set(role, credentials);
        if (cachePath) {
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, JSON.stringify(storageState, null, 2), { encoding: 'utf8', mode: 0o600 });
        }
        return { success: true, credentials };
      } catch (error) {
        return { success: false, error: `Password login failed for role '${role}': ${message(error)}` };
      } finally {
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      return { success: false, error: `Password authentication exception: ${message(error)}` };
    }
  }

  public clearCache(role?: string): void {
    if (role) this.memoryCache.delete(role);
    else this.memoryCache.clear();
  }

  private async validateCachedState(context: ExecutionContext, state: StorageState): Promise<boolean> {
    if (!this.options.validateSuccess) return true;
    const browser = await chromium.launch({ headless: true });
    try {
      const browserContext = await browser.newContext({ storageState: state });
      const page = await browserContext.newPage();
      await page.goto(this.loginUrl(context), { waitUntil: 'domcontentloaded' });
      await this.options.validateSuccess(page);
      return true;
    } catch {
      return false;
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private toCredentials(role: string, state: StorageState): AuthCredentials {
    return {
      role,
      storageState: state,
      cookies: state.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
    };
  }

  private loginUrl(context: ExecutionContext): string {
    return this.options.loginUrl.startsWith('http')
      ? this.options.loginUrl
      : new URL(this.options.loginUrl, context.baseUrl).toString();
  }

  private cachePath(role: string): string | undefined {
    if (!this.options.storageStatePath) return undefined;
    return typeof this.options.storageStatePath === 'function'
      ? this.options.storageStatePath(role)
      : this.options.storageStatePath.replace('{role}', role.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }

  private async readCache(cachePath: string): Promise<StorageState | undefined> {
    try {
      const parsed = JSON.parse(await fs.readFile(cachePath, 'utf8')) as Partial<StorageState>;
      return Array.isArray(parsed.cookies) && Array.isArray(parsed.origins) ? parsed as StorageState : undefined;
    } catch {
      return undefined;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
