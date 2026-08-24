import { describe, it, expect } from 'vitest';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';

describe('FlowLoader', () => {
  it('should parse a valid YAML flow definition', () => {
    const yaml = `
id: sample.flow
name: Sample Flow
priority: critical
steps:
  - action: navigate
    target: /test
assertions:
  - type: element_visible
    target: h1
`;
    const flow = FlowLoader.parseString(yaml);
    expect(flow.id).toBe('sample.flow');
    expect(flow.name).toBe('Sample Flow');
    expect(flow.priority).toBe('critical');
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0].id).toBe('step-1');
    expect(flow.assertions).toHaveLength(1);
    expect(flow.assertions[0].id).toBe('assert-1');
  });

  it('should parse a valid JSON flow definition', () => {
    const json = JSON.stringify({
      id: 'sample.json.flow',
      name: 'Sample JSON Flow',
      steps: [{ action: 'click', target: 'button' }],
      assertions: [{ type: 'text_contains', target: 'p', value: 'hello' }],
    });
    const flow = FlowLoader.parseString(json, 'sample.json');
    expect(flow.id).toBe('sample.json.flow');
    expect(flow.steps[0].action).toBe('click');
    expect(flow.assertions[0].value).toBe('hello');
  });

  it('should throw an error for missing steps or assertions', () => {
    const invalidYaml = `
id: broken.flow
name: Broken Flow
steps: []
assertions: []
`;
    expect(() => FlowLoader.parseString(invalidYaml)).toThrowError(/schema validation failed/i);
  });
});
