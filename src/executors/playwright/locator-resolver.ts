import type { Locator, Page } from 'playwright';
import type { FlowTarget, StructuredLocatorTarget } from '../../core/contracts/flow.js';

export function describeTarget(target: FlowTarget): string {
  return typeof target === 'string' ? target : JSON.stringify(target);
}

export function resolveLocator(page: Page, target: FlowTarget): Locator {
  if (typeof target === 'string') return page.locator(target);
  return resolveStructuredLocator(page, target);
}

function resolveStructuredLocator(page: Page, target: StructuredLocatorTarget): Locator {
  if ('role' in target) {
    return page.getByRole(target.role as Parameters<Page['getByRole']>[0], {
      name: target.name,
      exact: target.exact,
    });
  }
  if ('label' in target) return page.getByLabel(target.label, { exact: target.exact });
  if ('testId' in target) return page.getByTestId(target.testId);
  if ('text' in target) return page.getByText(target.text, { exact: target.exact });
  if ('placeholder' in target) {
    return page.getByPlaceholder(target.placeholder, { exact: target.exact });
  }
  return page.locator(target.selector);
}
