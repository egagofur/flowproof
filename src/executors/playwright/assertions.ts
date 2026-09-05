import type { Page } from 'playwright';
import type { FlowAssertion } from '../../core/contracts/flow.js';
import type { ExecutionContext } from '../../core/contracts/context.js';
import { describeTarget, resolveLocator } from './locator-resolver.js';

export type CustomAssertionHandler = (
  page: Page,
  assertion: FlowAssertion,
  context: ExecutionContext
) => Promise<{ passed: boolean; actual?: unknown; error?: string }>;

export class PlaywrightAssertionRunner {
  private customHandlers = new Map<string, CustomAssertionHandler>();

  public registerCustomHandler(name: string, handler: CustomAssertionHandler): void {
    this.customHandlers.set(name, handler);
  }

  public async evaluate(
    page: Page,
    assertion: FlowAssertion,
    context: ExecutionContext
  ): Promise<{ passed: boolean; actual?: unknown; error?: string }> {
    const timeout = assertion.timeoutMs || context.options.timeoutMs || 10000;
    const target = assertion.target;

    switch (assertion.type) {
      case 'element_visible': {
        if (!target) throw required(assertion.type);
        const locator = resolveLocator(page, target);
        try {
          await locator.waitFor({ state: 'visible', timeout });
          const visible = await locator.isVisible();
          return { passed: visible, actual: visible ? 'visible' : 'hidden' };
        } catch (error) {
          return failure('hidden or not found', `Element '${describeTarget(target)}' was not visible within ${timeout}ms: ${message(error)}`);
        }
      }
      case 'element_hidden': {
        if (!target) throw required(assertion.type);
        const locator = resolveLocator(page, target);
        try {
          await locator.waitFor({ state: 'hidden', timeout });
          const hidden = !(await locator.isVisible());
          return { passed: hidden, actual: hidden ? 'hidden' : 'visible' };
        } catch (error) {
          return failure('visible', `Element '${describeTarget(target)}' remained visible after ${timeout}ms: ${message(error)}`);
        }
      }
      case 'text_contains':
      case 'text_equals': {
        if (!target) throw required(assertion.type);
        const locator = resolveLocator(page, target);
        await locator.waitFor({ state: 'attached', timeout });
        const exact = assertion.type === 'text_equals';
        const actual = ((await locator.textContent()) || '').trim();
        const expected = String(assertion.value ?? '').trim();
        const passed = exact ? actual === expected : actual.includes(expected);
        return passed
          ? { passed, actual }
          : failure(actual, exact
            ? `Expected exact text '${expected}', but got '${actual}'`
            : `Expected text containing '${expected}', but got '${actual}'`);
      }
      case 'url_matches': {
        const expected = String(assertion.value ?? (typeof target === 'string' ? target : '') ?? '');
        const currentUrl = page.url();
        const source = expected.startsWith('/') && expected.endsWith('/') ? expected.slice(1, -1) : expected;
        const passed = new RegExp(source).test(currentUrl);
        return passed ? { passed, actual: currentUrl } : failure(currentUrl, `Expected URL matching '${expected}', but got '${currentUrl}'`);
      }
      case 'attribute_equals': {
        if (!target || !assertion.attribute) throw new Error(`Assertion 'attribute_equals' requires 'target' and 'attribute'`);
        const locator = resolveLocator(page, target);
        await locator.waitFor({ state: 'attached', timeout });
        const actual = await locator.getAttribute(assertion.attribute);
        const expected = String(assertion.value ?? '');
        const passed = actual === expected;
        return passed ? { passed, actual } : failure(actual, `Expected attribute '${assertion.attribute}' to equal '${expected}', but got '${actual}'`);
      }
      case 'value_equals': {
        if (!target) throw required(assertion.type);
        const locator = resolveLocator(page, target);
        await locator.waitFor({ state: 'attached', timeout });
        const actual = await locator.inputValue();
        const expected = String(assertion.value ?? '');
        const passed = actual === expected;
        return passed ? { passed, actual } : failure(actual, `Expected input value '${expected}', but got '${actual}'`);
      }
      case 'element_count': {
        if (!target) throw required(assertion.type);
        const count = await resolveLocator(page, target).count();
        const expected = assertion.count ?? Number(assertion.value ?? 0);
        const passed = count === expected;
        return passed ? { passed, actual: count } : failure(count, `Expected element count of ${expected} for '${describeTarget(target)}', but counted ${count}`);
      }
      case 'custom_assert': {
        const handlerName = assertion.customHandler || (typeof target === 'string' ? target : undefined);
        if (!handlerName) throw new Error(`Custom assertion requires a 'customHandler' or string 'target' name`);
        const handler = this.customHandlers.get(handlerName);
        if (!handler) throw new Error(`Custom assertion handler '${handlerName}' is not registered`);
        return handler(page, assertion, context);
      }
      default:
        throw new Error(`Unsupported assertion type: ${(assertion as { type: string }).type}`);
    }
  }
}

function required(type: string): Error {
  return new Error(`Assertion '${type}' requires a 'target'`);
}

function failure(actual: unknown, error: string) {
  return { passed: false, actual, error };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
