import { describe, expect, it } from 'vitest';
import type { RecordedError } from '../../src/core/contracts/result.js';
import { evaluateErrorPolicy, safePattern } from '../../src/executors/playwright/error-policy.js';

const error = (source: RecordedError['source'], overrides: Partial<RecordedError> = {}): RecordedError => ({
  source,
  message: `${source} problem`,
  time: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('Playwright error policy', () => {
  it.each([
    [error('pageerror'), 'failOnPageError'],
    [error('console'), 'failOnConsoleError'],
    [error('http', { status: 500, url: '/api/fail', method: 'GET' }), 'failOnHttp5xx'],
    [error('danger_notification'), 'failOnDangerNotification'],
    [error('dialog'), 'failOnUnexpectedDialog'],
  ])('fails enabled %s errors', (recorded, rule) => {
    expect(evaluateErrorPolicy([recorded]).violations[0].rule).toBe(rule);
  });

  it('records disabled errors without failing', () => {
    const result = evaluateErrorPolicy([error('console')], { failOnConsoleError: false });
    expect(result.recordedErrors).toHaveLength(1);
    expect(result.violations).toHaveLength(0);
  });

  it('narrowly allowlists console and request patterns', () => {
    const errors = [
      error('console', { message: 'Known extension warning' }),
      error('http', { message: 'GET https://cms.test/health returned 500', method: 'GET', url: 'https://cms.test/health', status: 500 }),
    ];
    const result = evaluateErrorPolicy(errors, {
      ignoredConsolePatterns: ['Known * warning'],
      ignoredRequestPatterns: ['/GET https:\\/\\/cms\\.test\\/health/'],
    });
    expect(result.violations).toHaveLength(0);
    expect(result.recordedErrors.every((item) => item.ignored)).toBe(true);
    expect(safePattern('exact').test('not exact')).toBe(false);
  });

  it('does not fail HTTP 4xx unless configured', () => {
    const http404 = error('http', { status: 404, url: '/missing', method: 'GET' });
    expect(evaluateErrorPolicy([http404]).violations).toHaveLength(0);
    expect(evaluateErrorPolicy([http404], { failOnHttp4xx: true }).violations[0].rule).toBe('failOnHttp4xx');
  });
});
