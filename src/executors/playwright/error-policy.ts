import type { Page } from 'playwright';
import type { ErrorPolicy } from '../../core/contracts/context.js';
import type { PolicyViolation, RecordedError } from '../../core/contracts/result.js';
import { resolveLocator } from './locator-resolver.js';

export const DEFAULT_ERROR_POLICY: Required<Omit<ErrorPolicy, 'dangerNotificationTargets'>> & Pick<ErrorPolicy, 'dangerNotificationTargets'> = {
  failOnPageError: true,
  failOnConsoleError: true,
  failOnHttp5xx: true,
  failOnHttp4xx: false,
  failOnRequestFailed: false,
  failOnDangerNotification: true,
  failOnUnexpectedDialog: true,
  ignoredConsolePatterns: [],
  ignoredRequestPatterns: [],
  dangerNotificationTargets: [],
};

export function mergeErrorPolicy(policy?: ErrorPolicy): typeof DEFAULT_ERROR_POLICY {
  return { ...DEFAULT_ERROR_POLICY, ...policy };
}

export function evaluateErrorPolicy(
  errors: RecordedError[],
  configured?: ErrorPolicy
): { recordedErrors: RecordedError[]; violations: PolicyViolation[] } {
  const policy = mergeErrorPolicy(configured);
  const violations: PolicyViolation[] = [];
  const recordedErrors = errors.map((error) => {
    const ignored = isIgnored(error, policy);
    const recorded = { ...error, ignored };
    if (ignored) return recorded;

    const rule = violationRule(error, policy);
    if (rule) violations.push({ ...recorded, rule });
    return recorded;
  });
  return { recordedErrors, violations };
}

export async function detectDangerNotifications(
  page: Page,
  policy: ErrorPolicy | undefined,
  errors: RecordedError[]
): Promise<void> {
  const merged = mergeErrorPolicy(policy);
  if (!merged.failOnDangerNotification) return;

  const candidates = [page.getByRole('alert'), ...(merged.dangerNotificationTargets ?? []).map((target) => resolveLocator(page, target))];
  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (!(await item.isVisible().catch(() => false))) continue;
      const text = ((await item.innerText().catch(() => '')) || '').trim();
      const configuredTarget = candidate !== candidates[0];
      if (configuredTarget || /error|danger|failed|unable|problem|went wrong/i.test(text)) {
        if (!errors.some((error) => error.source === 'danger_notification' && error.message === text)) {
          errors.push({
            source: 'danger_notification',
            message: text || 'Visible danger notification',
            time: new Date().toISOString(),
          });
        }
      }
    }
  }
}

function violationRule(error: RecordedError, policy: ReturnType<typeof mergeErrorPolicy>): string | undefined {
  if (error.source === 'pageerror' && policy.failOnPageError) return 'failOnPageError';
  if (error.source === 'console' && policy.failOnConsoleError) return 'failOnConsoleError';
  if (error.source === 'http' && (error.status ?? 0) >= 500 && policy.failOnHttp5xx) return 'failOnHttp5xx';
  if (error.source === 'http' && (error.status ?? 0) >= 400 && (error.status ?? 0) < 500 && policy.failOnHttp4xx) return 'failOnHttp4xx';
  if (error.source === 'requestfailed' && policy.failOnRequestFailed) return 'failOnRequestFailed';
  if (error.source === 'danger_notification' && policy.failOnDangerNotification) return 'failOnDangerNotification';
  if (error.source === 'dialog' && policy.failOnUnexpectedDialog) return 'failOnUnexpectedDialog';
  return undefined;
}

function isIgnored(error: RecordedError, policy: ReturnType<typeof mergeErrorPolicy>): boolean {
  const patterns = error.source === 'console' || error.source === 'pageerror'
    ? policy.ignoredConsolePatterns
    : error.source === 'http' || error.source === 'requestfailed'
      ? policy.ignoredRequestPatterns
      : [];
  const subject = error.source === 'http' || error.source === 'requestfailed'
    ? `${error.method ?? ''} ${error.url ?? ''}`
    : error.message;
  return patterns.some((pattern) => safePattern(pattern).test(subject));
}

export function safePattern(pattern: string): RegExp {
  const regex = pattern.match(/^\/(.*)\/([im]*)$/);
  if (regex) {
    try {
      return new RegExp(regex[1], regex[2]);
    } catch {
      // Invalid regexes are treated literally instead of widening an allowlist.
    }
  }
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}
