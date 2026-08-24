import { chromium, Page } from 'playwright';
import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface PasswordAuthOptions {
  loginUrl: string;
  usernameField?: string;
  passwordField?: string;
  submitField?: string;
  credentials: (role: string) => Promise<{ username: string; password: string }> | { username: string; password: string };
  validateSuccess?: (page: Page) => Promise<void>;
}

export class PasswordAuthStrategy implements AuthStrategy {
  public readonly name = 'PasswordAuth';

  constructor(private options: PasswordAuthOptions) {}

  public async authenticate(context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const creds = await this.options.credentials(role);
      if (!creds.username || !creds.password) {
        return {
          success: false,
          error: `Missing username or password credentials for role '${role}'`,
        };
      }

      // Launch temporary headless browser to perform login and harvest storageState & cookies
      const browser = await chromium.launch({ headless: true });
      const browserContext = await browser.newContext();
      const page = await browserContext.newPage();

      try {
        const fullUrl = this.options.loginUrl.startsWith('http')
          ? this.options.loginUrl
          : new URL(this.options.loginUrl, context.baseUrl).toString();

        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

        const usernameSelector = this.options.usernameField || 'input[name="username"], input[name="email"], input[type="email"]';
        const passwordSelector = this.options.passwordField || 'input[name="password"], input[type="password"]';
        const submitSelector = this.options.submitField || 'button[type="submit"], input[type="submit"]';

        await page.fill(usernameSelector, creds.username);
        await page.fill(passwordSelector, creds.password);
        await page.click(submitSelector);

        if (this.options.validateSuccess) {
          await this.options.validateSuccess(page);
        } else {
          await page.waitForLoadState('networkidle').catch(() => {});
        }

        const cookies = await browserContext.cookies();
        const storageState = await browserContext.storageState();

        await browser.close();

        return {
          success: true,
          credentials: {
            role,
            cookies: cookies.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: c.sameSite as any,
            })),
            storageState,
          },
        };
      } catch (err: any) {
        await browser.close().catch(() => {});
        return {
          success: false,
          error: `Password login failed for role '${role}': ${err.message}`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Password authentication exception: ${err.message}`,
      };
    }
  }
}
