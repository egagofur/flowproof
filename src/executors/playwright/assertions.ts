import { Page } from 'playwright';
import { FlowAssertion } from '../../core/contracts/flow.js';
import { ExecutionContext } from '../../core/contracts/context.js';

export type CustomAssertionHandler = (
  page: Page,
  assertion: FlowAssertion,
  context: ExecutionContext
) => Promise<{ passed: boolean; actual?: unknown; error?: string }>;

export class PlaywrightAssertionRunner {
  private customHandlers: Map<string, CustomAssertionHandler> = new Map();

  public registerCustomHandler(name: string, handler: CustomAssertionHandler): void {
    this.customHandlers.set(name, handler);
  }

  public async evaluate(
    page: Page,
    assertion: FlowAssertion,
    context: ExecutionContext
  ): Promise<{ passed: boolean; actual?: unknown; error?: string }> {
    const timeout = assertion.timeoutMs || context.options.timeoutMs || 10000;

    switch (assertion.type) {
      case 'element_visible': {
        if (!assertion.target) throw new Error(`Assertion 'element_visible' requires a 'target' selector`);
        const locator = page.locator(assertion.target);
        try {
          await locator.waitFor({ state: 'visible', timeout });
          const isVis = await locator.isVisible();
          return { passed: isVis, actual: isVis ? 'visible' : 'hidden' };
        } catch (err: any) {
          return {
            passed: false,
            actual: 'hidden or not found',
            error: `Element '${assertion.target}' was not visible within ${timeout}ms: ${err.message}`,
          };
        }
      }

      case 'element_hidden': {
        if (!assertion.target) throw new Error(`Assertion 'element_hidden' requires a 'target' selector`);
        const locator = page.locator(assertion.target);
        try {
          await locator.waitFor({ state: 'hidden', timeout });
          const isHidden = !(await locator.isVisible());
          return { passed: isHidden, actual: isHidden ? 'hidden' : 'visible' };
        } catch (err: any) {
          return {
            passed: false,
            actual: 'visible',
            error: `Element '${assertion.target}' remained visible after ${timeout}ms: ${err.message}`,
          };
        }
      }

      case 'text_contains': {
        if (!assertion.target) throw new Error(`Assertion 'text_contains' requires a 'target' selector`);
        const locator = page.locator(assertion.target);
        await locator.waitFor({ state: 'attached', timeout });
        const text = await locator.textContent();
        const expected = String(assertion.value ?? '');
        const actual = text || '';
        const passed = actual.includes(expected);
        return {
          passed,
          actual,
          error: passed
            ? undefined
            : `Expected text containing '${expected}', but got '${actual.trim()}'`,
        };
      }

      case 'text_equals': {
        if (!assertion.target) throw new Error(`Assertion 'text_equals' requires a 'target' selector`);
        const locator = page.locator(assertion.target);
        await locator.waitFor({ state: 'attached', timeout });
        const text = await locator.textContent();
        const expected = String(assertion.value ?? '').trim();
        const actual = (text || '').trim();
        const passed = actual === expected;
        return {
          passed,
          actual,
          error: passed
            ? undefined
            : `Expected exact text '${expected}', but got '${actual}'`,
        };
      }

      case 'url_matches': {
        const expected = String(assertion.value ?? assertion.target ?? '');
        const currentUrl = page.url();
        const isRegex = expected.startsWith('/') && expected.endsWith('/');
        const regex = isRegex ? new RegExp(expected.slice(1, -1)) : new RegExp(expected);
        const passed = regex.test(currentUrl);
        return {
          passed,
          actual: currentUrl,
          error: passed
            ? undefined
            : `Expected URL matching '${expected}', but got '${currentUrl}'`,
        };
      }

      case 'attribute_equals': {
        if (!assertion.target || !assertion.attribute) {
          throw new Error(`Assertion 'attribute_equals' requires 'target' and 'attribute'`);
        }
        const locator = page.locator(assertion.target);
        await locator.waitFor({ state: 'attached', timeout });
        const actual = await locator.getAttribute(assertion.attribute);
        const expected = String(assertion.value ?? '');
        const passed = actual === expected;
        return {
          passed,
          actual,
          error: passed
            ? undefined
            : `Expected attribute '${assertion.attribute}' to equal '${expected}', but got '${actual}'`,
        };
      }

      case 'value_equals': {
        if (!assertion.target) throw new Error(`Assertion 'value_equals' requires a 'target' selector`);
        const locator = page.locator(assertion.target);
        await locator.waitFor({ state: 'attached', timeout });
        const actual = await locator.inputValue();
        const expected = String(assertion.value ?? '');
        const passed = actual === expected;
        return {
          passed,
          actual,
          error: passed
            ? undefined
            : `Expected input value '${expected}', but got '${actual}'`,
        };
      }

      case 'element_count': {
        if (!assertion.target) throw new Error(`Assertion 'element_count' requires a 'target' selector`);
        const count = await page.locator(assertion.target).count();
        const expected = assertion.count ?? Number(assertion.value ?? 0);
        const passed = count === expected;
        return {
          passed,
          actual: count,
          error: passed
            ? undefined
            : `Expected element count of ${expected} for '${assertion.target}', but counted ${count}`,
        };
      }

      case 'custom_assert': {
        const handlerName = assertion.customHandler || assertion.target;
        if (!handlerName) {
          throw new Error(`Custom assertion requires a 'customHandler' or 'target' name`);
        }
        const handler = this.customHandlers.get(handlerName);
        if (!handler) {
          throw new Error(`Custom assertion handler '${handlerName}' is not registered`);
        }
        return handler(page, assertion, context);
      }

      default:
        throw new Error(`Unsupported assertion type: ${(assertion as any).type}`);
    }
  }
}
