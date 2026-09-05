import type { Locator, Page } from 'playwright';
import type { FlowStep, FlowTarget } from '../../core/contracts/flow.js';
import type { ExecutionContext } from '../../core/contracts/context.js';
import { describeTarget, resolveLocator } from './locator-resolver.js';

export type CustomActionHandler = (
  page: Page,
  step: FlowStep,
  context: ExecutionContext
) => Promise<void>;

export class PlaywrightActionRunner {
  private customHandlers = new Map<string, CustomActionHandler>();

  public registerCustomHandler(name: string, handler: CustomActionHandler): void {
    this.customHandlers.set(name, handler);
  }

  public async runStep(page: Page, step: FlowStep, context: ExecutionContext): Promise<void> {
    const timeout = step.timeoutMs || context.options.timeoutMs || 15000;

    switch (step.action) {
      case 'navigate': {
        const target = step.target || '/';
        if (typeof target !== 'string') throw new Error(`Action 'navigate' requires a string target`);
        const url = target.startsWith('http://') || target.startsWith('https://')
          ? target
          : new URL(target, context.baseUrl).toString();
        await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
        return;
      }
      case 'click':
        await (await this.visibleTarget(page, requiredTarget(step), timeout)).click({ timeout });
        return;
      case 'fill':
        await (await this.visibleTarget(page, requiredTarget(step), timeout)).fill(String(step.value ?? ''), { timeout });
        return;
      case 'type':
        await (await this.visibleTarget(page, requiredTarget(step), timeout)).pressSequentially(String(step.value ?? ''), { timeout });
        return;
      case 'select':
        await (await this.visibleTarget(page, requiredTarget(step), timeout)).selectOption(String(step.value ?? ''), { timeout });
        return;
      case 'select_option':
        await this.selectCustomOption(page, requiredTarget(step), optionValue(step), timeout);
        return;
      case 'select_relation':
        await this.selectRelation(page, requiredTarget(step), step.value, timeout);
        return;
      case 'remove_relation':
        await this.removeRelation(page, requiredTarget(step), step.value, timeout);
        return;
      case 'toggle':
        await this.toggle(page, requiredTarget(step), step.value, timeout);
        return;
      case 'upload_file': {
        const files = Array.isArray(step.value) ? step.value.map(String) : String(step.value ?? '');
        if ((Array.isArray(files) && files.length === 0) || files === '') {
          throw new Error(`Action 'upload_file' requires a file path value`);
        }
        const target = resolveLocator(page, requiredTarget(step));
        const input = (await target.getAttribute('type').catch(() => null)) === 'file'
          ? target
          : target.locator('input[type="file"]').first();
        await input.setInputFiles(files, { timeout });
        return;
      }
      case 'fill_tiptap': {
        const target = await this.visibleTarget(page, requiredTarget(step), timeout);
        const editable = (await target.getAttribute('contenteditable').catch(() => null)) === 'true'
          ? target
          : target.locator('[contenteditable="true"]').first();
        await editable.waitFor({ state: 'visible', timeout });
        await editable.fill(String(step.value ?? ''), { timeout });
        await editable.blur();
        return;
      }
      case 'select_date': {
        const target = await this.visibleTarget(page, requiredTarget(step), timeout);
        await target.fill(this.resolveDateValue(step.value), { timeout });
        return;
      }
      case 'hover':
        await (await this.visibleTarget(page, requiredTarget(step), timeout)).hover({ timeout });
        return;
      case 'wait':
        if (typeof step.value === 'number') await page.waitForTimeout(step.value);
        else if (step.target) await this.visibleTarget(page, step.target, timeout);
        else await page.waitForTimeout(1000);
        return;
      case 'submit':
        await this.submit(page, step.target, timeout);
        return;
      case 'press_key':
        if (step.target) await resolveLocator(page, step.target).press(String(step.value || 'Enter'), { timeout });
        else await page.keyboard.press(String(step.value || 'Enter'));
        return;
      case 'custom': {
        const handlerName = step.customHandler || (typeof step.target === 'string' ? step.target : undefined);
        if (!handlerName) throw new Error(`Custom action requires a 'customHandler' or string 'target' name`);
        const handler = this.customHandlers.get(handlerName);
        if (!handler) throw new Error(`Custom action handler '${handlerName}' is not registered`);
        await handler(page, step, context);
        return;
      }
      default:
        throw new Error(`Unsupported action: ${(step as { action: string }).action}`);
    }
  }

  private async visibleTarget(page: Page, target: FlowTarget, timeout: number): Promise<Locator> {
    const locator = resolveLocator(page, target);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  private async selectCustomOption(
    page: Page,
    target: FlowTarget,
    optionName: string,
    timeout: number
  ): Promise<void> {
    const field = await this.visibleTarget(page, target, timeout);
    const combobox = await this.combobox(field);
    try {
      await combobox.click({ timeout });
      const option = page.getByRole('option', { name: optionName, exact: true }).last();
      await option.waitFor({ state: 'visible', timeout });
      await option.click({ timeout });
      await option.waitFor({ state: 'hidden', timeout });
    } catch (error) {
      throw new Error(`Could not select option '${optionName}' in field ${describeTarget(target)}: ${message(error)}`);
    }
  }

  private async selectRelation(page: Page, target: FlowTarget, value: unknown, timeout: number): Promise<void> {
    const details = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    const option = String(details.option ?? details.name ?? value ?? '');
    const query = details.query === undefined ? undefined : String(details.query);
    if (!option) throw new Error(`Action 'select_relation' requires an option value for ${describeTarget(target)}`);

    const field = await this.visibleTarget(page, target, timeout);
    const combobox = await this.combobox(field);
    try {
      await combobox.click({ timeout });
      if (query) await combobox.fill(query, { timeout });
      const relationOption = page.getByRole('option', { name: option, exact: true }).last();
      await relationOption.waitFor({ state: 'visible', timeout });
      await relationOption.click({ timeout });
      await relationOption.waitFor({ state: 'hidden', timeout }).catch(() => undefined);
      await page.getByText(option, { exact: true }).last().waitFor({ state: 'visible', timeout });
    } catch (error) {
      throw new Error(`Could not select relation '${option}' in field ${describeTarget(target)}: ${message(error)}`);
    }
  }

  private async removeRelation(page: Page, target: FlowTarget, value: unknown, timeout: number): Promise<void> {
    const field = await this.visibleTarget(page, target, timeout);
    const name = value === undefined ? undefined : String(value);
    const button = field.getByRole('button', {
      name: name ? new RegExp(`remove.*${escapeRegex(name)}|${escapeRegex(name)}.*remove`, 'i') : /remove|delete|clear/i,
    }).first();
    try {
      await button.click({ timeout });
      if (name) await field.getByText(name, { exact: true }).waitFor({ state: 'hidden', timeout });
    } catch (error) {
      throw new Error(`Could not remove relation${name ? ` '${name}'` : ''} from field ${describeTarget(target)}: ${message(error)}`);
    }
  }

  private async toggle(page: Page, target: FlowTarget, value: unknown, timeout: number): Promise<void> {
    const control = await this.visibleTarget(page, target, timeout);
    const desired = value === undefined ? undefined : Boolean(value);
    const checked = await control.isChecked().catch(async () => (await control.getAttribute('aria-checked')) === 'true');
    if (desired === undefined || checked !== desired) await control.click({ timeout });
  }

  private async combobox(field: Locator): Promise<Locator> {
    if ((await field.getAttribute('role').catch(() => null)) === 'combobox') return field;
    return field.getByRole('combobox').first();
  }

  private async submit(page: Page, target: FlowTarget | undefined, timeout: number): Promise<void> {
    if (!target) {
      const button = page.locator('button[type="submit"], input[type="submit"]').first();
      if (await button.isVisible().catch(() => false)) await button.click({ timeout });
      else await page.keyboard.press('Enter');
      return;
    }
    const locator = await this.visibleTarget(page, target, timeout);
    const tag = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => '');
    if (tag === 'form') {
      const button = locator.locator('button[type="submit"], button, input[type="submit"]').first();
      if (await button.isVisible().catch(() => false)) await button.click({ timeout });
      else await locator.locator('input').first().press('Enter');
    } else if (tag === 'input') await locator.press('Enter');
    else await locator.click({ timeout });
  }

  private resolveDateValue(value: unknown): string {
    if (!value) return new Date().toISOString().split('T')[0];
    const normalized = String(value).toLowerCase().trim();
    const date = new Date();
    if (normalized === 'tomorrow') date.setDate(date.getDate() + 1);
    else if (normalized === 'yesterday') date.setDate(date.getDate() - 1);
    else if (normalized !== 'today') return String(value);
    return date.toISOString().split('T')[0];
  }
}

function requiredTarget(step: FlowStep): FlowTarget {
  if (!step.target) throw new Error(`Action '${step.action}' requires a 'target'`);
  return step.target;
}

function optionValue(step: FlowStep): string {
  const value = typeof step.value === 'object' && step.value !== null
    ? (step.value as Record<string, unknown>).option ?? (step.value as Record<string, unknown>).name
    : step.value;
  if (value === undefined || value === '') throw new Error(`Action '${step.action}' requires an option value`);
  return String(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
