import { Page } from 'playwright';
import { FlowStep } from '../../core/contracts/flow.js';
import { ExecutionContext } from '../../core/contracts/context.js';

export type CustomActionHandler = (
  page: Page,
  step: FlowStep,
  context: ExecutionContext
) => Promise<void>;

export class PlaywrightActionRunner {
  private customHandlers: Map<string, CustomActionHandler> = new Map();

  public registerCustomHandler(name: string, handler: CustomActionHandler): void {
    this.customHandlers.set(name, handler);
  }

  public async runStep(
    page: Page,
    step: FlowStep,
    context: ExecutionContext
  ): Promise<void> {
    const timeout = step.timeoutMs || context.options.timeoutMs || 15000;

    switch (step.action) {
      case 'navigate': {
        const target = step.target || '/';
        const url = target.startsWith('http://') || target.startsWith('https://')
          ? target
          : new URL(target, context.baseUrl).toString();
        await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
        break;
      }

      case 'click': {
        if (!step.target) throw new Error(`Action 'click' requires a 'target' selector`);
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.click({ timeout });
        break;
      }

      case 'fill': {
        if (!step.target) throw new Error(`Action 'fill' requires a 'target' selector`);
        const value = step.value !== undefined ? String(step.value) : '';
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.fill(value, { timeout });
        break;
      }

      case 'type': {
        if (!step.target) throw new Error(`Action 'type' requires a 'target' selector`);
        const value = step.value !== undefined ? String(step.value) : '';
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.pressSequentially(value, { timeout });
        break;
      }

      case 'select': {
        if (!step.target) throw new Error(`Action 'select' requires a 'target' selector`);
        const value = step.value !== undefined ? String(step.value) : '';
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.selectOption(value, { timeout });
        break;
      }

      case 'select_date': {
        if (!step.target) throw new Error(`Action 'select_date' requires a 'target' selector`);
        const resolvedDate = this.resolveDateValue(step.value);
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.fill(resolvedDate, { timeout });
        break;
      }

      case 'hover': {
        if (!step.target) throw new Error(`Action 'hover' requires a 'target' selector`);
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout });
        await locator.hover({ timeout });
        break;
      }

      case 'wait': {
        if (typeof step.value === 'number') {
          await page.waitForTimeout(step.value);
        } else if (step.target) {
          const locator = this.resolveLocator(page, step.target);
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await page.waitForTimeout(1000);
        }
        break;
      }

      case 'submit': {
        if (step.target) {
          const locator = this.resolveLocator(page, step.target);
          await locator.waitFor({ state: 'visible', timeout });
          await locator.click({ timeout });
        } else {
          // Fallback: press Enter or click submit button on page
          const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
          if (await submitBtn.isVisible()) {
            await submitBtn.click({ timeout });
          } else {
            await page.keyboard.press('Enter');
          }
        }
        break;
      }

      case 'press_key': {
        const key = String(step.value || 'Enter');
        if (step.target) {
          const locator = this.resolveLocator(page, step.target);
          await locator.press(key, { timeout });
        } else {
          await page.keyboard.press(key);
        }
        break;
      }

      case 'custom': {
        const handlerName = step.customHandler || step.target;
        if (!handlerName) {
          throw new Error(`Custom action requires a 'customHandler' or 'target' name`);
        }
        const handler = this.customHandlers.get(handlerName);
        if (!handler) {
          throw new Error(`Custom action handler '${handlerName}' is not registered`);
        }
        await handler(page, step, context);
        break;
      }

      default:
        throw new Error(`Unsupported action: ${(step as any).action}`);
    }
  }

  private resolveLocator(page: Page, target: string) {
    // If target uses Playwright selector syntax directly
    return page.locator(target);
  }

  private resolveDateValue(val: unknown): string {
    if (!val) return new Date().toISOString().split('T')[0];
    const str = String(val).toLowerCase().trim();

    const now = new Date();
    if (str === 'today') {
      return now.toISOString().split('T')[0];
    }
    if (str === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    if (str === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }
    // Return original string if format like YYYY-MM-DD
    return String(val);
  }
}
