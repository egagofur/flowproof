import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import pc from 'picocolors';
import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface InteractiveBrowserAuthOptions {
  storageStatePath?: string;
  loginUrl?: string;
  successUrlPattern?: RegExp | string;
  cookieName?: string;
  timeoutMs?: number;
}

export class InteractiveBrowserAuthStrategy implements AuthStrategy {
  public readonly name = 'InteractiveBrowserAuth';

  constructor(private options: InteractiveBrowserAuthOptions = {}) { }

  public async authenticate(context: ExecutionContext, role: string): Promise<AuthResult> {
    const storagePath =
      this.options.storageStatePath ||
      path.join(process.cwd(), '.auth', `${role}-state.json`);

    // 1. Try reading existing valid storage state file first
    try {
      const content = await fs.readFile(storagePath, 'utf-8');
      const storageState = JSON.parse(content);
      return {
        success: true,
        credentials: {
          role,
          storageState,
        },
      };
    } catch {
      // If file doesn't exist, proceed to interactive manual login
    }

    // 2. Interactive login in visible browser
    console.log(pc.cyan(`\n🔐 [Intentproof Interactive Auth] Please log in manually in the opened browser window...`));
    console.log(pc.dim(`   Target: ${this.options.loginUrl || '/auth/login'}`));
    console.log(pc.yellow(`   ⏳ Waiting for you to complete login (timeout: ${Math.round((this.options.timeoutMs || 120000) / 1000)}s)...`));

    const targetUrl = (this.options.loginUrl || '/auth/login').startsWith('http')
      ? this.options.loginUrl || '/auth/login'
      : new URL(this.options.loginUrl || '/auth/login', context.baseUrl).toString();

    let browser;
    try {
      // Try real Google Chrome first for Google OAuth compatibility
      browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      });
    } catch {
      // Fallback to standard chromium
      browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      });
    }

    const browserCtx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    await browserCtx.addInitScript(() => {
      // Mask Playwright automation flags from Google OAuth
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await browserCtx.newPage();

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      const timeoutMs = this.options.timeoutMs || 120000;
      const startTime = Date.now();

      // Poll until logged in (URL changed away from login, or cookie present)
      let loggedIn = false;
      while (Date.now() - startTime < timeoutMs) {
        await page.waitForTimeout(1000);

        const currentUrl = page.url();
        const cookies = await browserCtx.cookies();

        const cookieFound = this.options.cookieName
          ? cookies.some((c) => c.name.includes(this.options.cookieName!))
          : cookies.some((c) => c.name.includes('session') || c.name.includes('token') || c.name.includes('auth'));

        const patternMatched = this.options.successUrlPattern
          ? typeof this.options.successUrlPattern === 'string'
            ? currentUrl.includes(this.options.successUrlPattern)
            : this.options.successUrlPattern.test(currentUrl)
          : !currentUrl.includes('login') && (currentUrl.includes('dashboard') || currentUrl.includes('search') || currentUrl === context.baseUrl || currentUrl === `${context.baseUrl}/`);

        if (patternMatched || (cookieFound && !currentUrl.includes('login'))) {
          loggedIn = true;
          break;
        }
      }

      if (!loggedIn) {
        throw new Error(`Login timed out after ${timeoutMs / 1000}s`);
      }

      console.log(pc.green(`   ✅ Login detected! Saving session state...`));

      // Ensure directory exists
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await browserCtx.storageState({ path: storagePath });

      const savedContent = await fs.readFile(storagePath, 'utf-8');
      const storageState = JSON.parse(savedContent);

      console.log(pc.green(`   💾 Session saved to ${storagePath}. Resuming automated flow verification!\n`));

      return {
        success: true,
        credentials: {
          role,
          storageState,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Interactive login failed: ${err.message}`,
      };
    } finally {
      await browser.close().catch(() => { });
    }
  }
}
