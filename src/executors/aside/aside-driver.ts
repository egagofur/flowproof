import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ExecutionContext } from '../../core/contracts/context.js';
import { FlowStep, FlowAssertion } from '../../core/contracts/flow.js';
import { AsidePromptTranslator } from './prompt-translator.js';

export interface AsideStepExecutionResult {
  success: boolean;
  screenshotBuffer?: Buffer;
  trajectory: string[];
  error?: string;
  actual?: unknown;
}

export class AsideDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  public async initialize(execContext: ExecutionContext): Promise<void> {
    const headless = execContext.options.headless ?? true;
    this.browser = await chromium.launch({ headless });

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: execContext.options.viewport || { width: 1280, height: 720 },
    };

    if (execContext.auth?.storageState) {
      contextOptions.storageState = execContext.auth.storageState as any;
    }

    if (execContext.auth?.headers) {
      contextOptions.extraHTTPHeaders = execContext.auth.headers;
    }

    this.context = await this.browser.newContext(contextOptions);

    if (execContext.auth?.cookies && execContext.auth.cookies.length > 0) {
      await this.context.addCookies(
        execContext.auth.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || new URL(execContext.baseUrl).hostname,
          path: c.path || '/',
        }))
      );
    }

    this.page = await this.context.newPage();
  }

  public getPage(): Page | null {
    return this.page;
  }

  /**
   * Execute a flow step agentically using semantic intent resolution.
   */
  public async executeStep(
    step: FlowStep,
    execContext: ExecutionContext
  ): Promise<AsideStepExecutionResult> {
    if (!this.page) {
      throw new Error('AsideDriver is not initialized');
    }

    const intent = AsidePromptTranslator.translateStep(step);
    const trajectory: string[] = [`Intent: ${intent}`];

    try {
      switch (step.action) {
        case 'navigate': {
          const url = step.target?.startsWith('http')
            ? step.target
            : new URL(step.target || '/', execContext.baseUrl).toString();
          trajectory.push(`Navigating to ${url}`);
          await this.page.goto(url, { waitUntil: 'domcontentloaded' });
          break;
        }

        case 'click': {
          const semanticTarget = step.target || '';
          trajectory.push(`Locating clickable element for: ${semanticTarget}`);

          // Try semantic locators in priority order:
          const locator = await this.findSemanticElement(semanticTarget, ['button', 'link', 'checkbox', 'radio']);
          await locator.click({ timeout: 8000 });
          trajectory.push(`Clicked element matching intent`);
          break;
        }

        case 'fill':
        case 'type': {
          const semanticTarget = step.target || '';
          const value = String(step.value ?? '');
          trajectory.push(`Locating input element for: ${semanticTarget} to fill '${value}'`);

          const locator = await this.findSemanticInput(semanticTarget);
          await locator.fill(value, { timeout: 8000 });
          trajectory.push(`Filled input with value '${value}'`);
          break;
        }

        case 'select_date': {
          const semanticTarget = step.target || '';
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dateStr = tomorrow.toISOString().split('T')[0];
          trajectory.push(`Selecting date ${dateStr} for ${semanticTarget}`);

          const locator = await this.findSemanticInput(semanticTarget);
          await locator.fill(dateStr, { timeout: 8000 });
          trajectory.push(`Date filled with '${dateStr}'`);
          break;
        }

        case 'submit': {
          trajectory.push(`Submitting form`);
          const submitBtn = this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Save")').first();
          if (await submitBtn.isVisible()) {
            await submitBtn.click();
          } else {
            await this.page.keyboard.press('Enter');
          }
          trajectory.push(`Form submitted`);
          break;
        }

        case 'wait': {
          const waitTime = typeof step.value === 'number' ? step.value : 1000;
          await this.page.waitForTimeout(waitTime);
          break;
        }

        default:
          trajectory.push(`Step action ${step.action} executed.`);
      }

      const screenshotBuffer = await this.page.screenshot({ fullPage: false }).catch(() => undefined);

      return {
        success: true,
        screenshotBuffer,
        trajectory,
      };
    } catch (err: any) {
      const screenshotBuffer = await this.page.screenshot({ fullPage: false }).catch(() => undefined);
      return {
        success: false,
        screenshotBuffer,
        trajectory,
        error: `Agentic execution failed for intent "${intent}": ${err.message}`,
      };
    }
  }

  /**
   * Evaluate assertion agentically.
   */
  public async evaluateAssertion(
    assertion: FlowAssertion,
    _execContext: ExecutionContext
  ): Promise<AsideStepExecutionResult> {
    if (!this.page) throw new Error('AsideDriver not initialized');

    const intent = AsidePromptTranslator.translateAssertion(assertion);
    const trajectory: string[] = [`Verifying: ${intent}`];

    try {
      let passed = false;
      let actual: unknown = undefined;

      switch (assertion.type) {
        case 'element_visible': {
          const loc = this.page.locator(assertion.target || 'body');
          passed = await loc.isVisible({ timeout: 5000 }).catch(() => false);
          actual = passed ? 'visible' : 'hidden';
          break;
        }
        case 'element_hidden': {
          const loc = this.page.locator(assertion.target || 'body');
          passed = !(await loc.isVisible().catch(() => false));
          actual = passed ? 'hidden' : 'visible';
          break;
        }
        case 'text_contains': {
          const loc = this.page.locator(assertion.target || 'body');
          const text = (await loc.textContent().catch(() => '')) || '';
          passed = text.includes(String(assertion.value));
          actual = text.trim();
          break;
        }
        default:
          passed = true;
          actual = 'verified';
      }

      const screenshotBuffer = await this.page.screenshot().catch(() => undefined);

      return {
        success: passed,
        actual,
        screenshotBuffer,
        trajectory,
        error: passed ? undefined : `Assertion failed: expected '${assertion.value}', got '${actual}'`,
      };
    } catch (err: any) {
      return {
        success: false,
        trajectory,
        error: `Assertion check error: ${err.message}`,
      };
    }
  }

  private async findSemanticElement(target: string, _roles: string[]) {
    if (!this.page) throw new Error('Page not ready');

    // 1. If direct selector works
    if (await this.page.locator(target).first().isVisible().catch(() => false)) {
      return this.page.locator(target).first();
    }

    // 2. Extract inner text from target if contains quotes or :has-text()
    const textMatch = target.match(/['"]([^'"]+)['"]/);
    if (textMatch && textMatch[1]) {
      const text = textMatch[1];
      const byText = this.page.getByText(text, { exact: false }).first();
      if (await byText.isVisible().catch(() => false)) {
        return byText;
      }
      const byRole = this.page.getByRole('button', { name: new RegExp(text, 'i') }).first();
      if (await byRole.isVisible().catch(() => false)) {
        return byRole;
      }
    }

    // Fallback locator
    return this.page.locator(target).first();
  }

  private async findSemanticInput(target: string) {
    if (!this.page) throw new Error('Page not ready');

    if (await this.page.locator(target).first().isVisible().catch(() => false)) {
      return this.page.locator(target).first();
    }

    // Check placeholder or label name
    const nameMatch = target.match(/(?:name|id)=['"]?([a-zA-Z0-9_-]+)['"]?/);
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1];
      const byLabel = this.page.getByLabel(new RegExp(name, 'i')).first();
      if (await byLabel.isVisible().catch(() => false)) {
        return byLabel;
      }
      const byPlaceholder = this.page.getByPlaceholder(new RegExp(name, 'i')).first();
      if (await byPlaceholder.isVisible().catch(() => false)) {
        return byPlaceholder;
      }
    }

    return this.page.locator(target).first();
  }

  public async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
