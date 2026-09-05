import { describe, expect, it, vi } from 'vitest';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';
import { resolveLocator } from '../../src/executors/playwright/locator-resolver.js';

const flowYaml = (target: string) => `
id: locator.test
name: Locator test
steps:
  - action: click
    target: ${target.split('\n').join('\n      ')}
assertions:
  - type: element_visible
    target: ${target.split('\n').join('\n      ')}
`;

describe('structured semantic locators', () => {
  it.each([
    ['role', '{ role: button, name: Save, exact: true }', 'getByRole', ['button', { name: 'Save', exact: true }]],
    ['label', '{ label: Title, exact: true }', 'getByLabel', ['Title', { exact: true }]],
    ['test id', '{ testId: relation-input-news_category }', 'getByTestId', ['relation-input-news_category']],
    ['text', '{ text: Saved, exact: true }', 'getByText', ['Saved', { exact: true }]],
    ['placeholder', '{ placeholder: Search, exact: false }', 'getByPlaceholder', ['Search', { exact: false }]],
    ['selector', '{ selector: "[data-state=open]" }', 'locator', ['[data-state=open]']],
  ])('validates and resolves %s targets', (_name, yaml, method, args) => {
    const flow = FlowLoader.parseString(flowYaml(yaml));
    const sentinel = {};
    const page = {
      getByRole: vi.fn(() => sentinel),
      getByLabel: vi.fn(() => sentinel),
      getByTestId: vi.fn(() => sentinel),
      getByText: vi.fn(() => sentinel),
      getByPlaceholder: vi.fn(() => sentinel),
      locator: vi.fn(() => sentinel),
    };
    expect(resolveLocator(page as never, flow.steps[0].target!)).toBe(sentinel);
    expect(page[method as keyof typeof page]).toHaveBeenCalledWith(...args);
  });

  it('keeps legacy string selectors valid', () => {
    const flow = FlowLoader.parseString(flowYaml('"button.save"'));
    expect(flow.steps[0].target).toBe('button.save');
  });

  it.each([
    '{ role: button, label: Save }',
    '{ exact: true }',
    '{ role: "" }',
    '{ testId: save, extra: invalid }',
  ])('rejects invalid locator combination %s', (target) => {
    expect(() => FlowLoader.parseString(flowYaml(target))).toThrow(/schema validation failed/i);
  });
});
