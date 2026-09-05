import { describe, expect, it } from 'vitest';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';
import { resolveFlowRuntime } from '../../src/core/runtime/interpolation.js';
import { SecretRedactor } from '../../src/core/security/secret-redactor.js';

const flow = FlowLoader.parseString(`
id: variables.test
name: Variables
variables:
  title: "E2E News \${runId}"
  tokenValue: "\${env.TEST_CMS_TOKEN}"
steps:
  - action: fill
    target:
      label: "Title \${runId}"
    value: "\${title}"
assertions:
  - type: text_contains
    target: body
    value: "\${title}"
`);

describe('runtime interpolation', () => {
  it('uses one consistent variable set across targets, actions and assertions', () => {
    const runtime = resolveFlowRuntime(flow, { runId: 'run-123', env: { TEST_CMS_TOKEN: 'super-secret-value' } });
    expect(runtime.flow.steps[0].target).toEqual({ label: 'Title run-123' });
    expect(runtime.flow.steps[0].value).toBe('E2E News run-123');
    expect(runtime.flow.assertions[0].value).toBe('E2E News run-123');
    expect(runtime.variables.tokenValue).toBe('super-secret-value');
    expect(runtime.secretVariableNames).toContain('tokenValue');
  });

  it('creates distinct run IDs by default', () => {
    const first = resolveFlowRuntime(flow, { env: { TEST_CMS_TOKEN: 'super-secret-value' } });
    const second = resolveFlowRuntime(flow, { env: { TEST_CMS_TOKEN: 'super-secret-value' } });
    expect(first.variables.runId).not.toBe(second.variables.runId);
  });

  it('fails early when a variable is missing', () => {
    const missing = FlowLoader.parseString(`
id: missing.variable
name: Missing
steps:
  - action: fill
    target: input
    value: "\${doesNotExist}"
assertions:
  - type: element_visible
    target: body
`);
    expect(() => resolveFlowRuntime(missing)).toThrow(/doesNotExist/);
  });

  it('redacts interpolated secret values', () => {
    const runtime = resolveFlowRuntime(flow, { runId: 'x', env: { TEST_CMS_TOKEN: 'super-secret-value' } });
    const redactor = new SecretRedactor();
    for (const name of runtime.secretVariableNames) redactor.registerSecret(String(runtime.variables[name]));
    expect(redactor.redact(JSON.stringify(runtime.flow))).not.toContain('super-secret-value');
  });
});
