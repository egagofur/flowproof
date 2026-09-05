import { describe, expect, it, vi } from 'vitest';

const { launch } = vi.hoisted(() => ({
  launch: vi.fn(async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => undefined,
        fill: async () => undefined,
        click: async () => undefined,
        waitForLoadState: async () => undefined,
      }),
      storageState: async () => ({ cookies: [], origins: [] }),
    }),
    close: async () => undefined,
  })),
}));

vi.mock('playwright', () => ({ chromium: { launch } }));

import { PasswordAuthStrategy } from '../../src/adapter/auth/password-auth.js';
import type { ExecutionContext } from '../../src/core/contracts/context.js';

describe('PasswordAuthStrategy reuse', () => {
  it('authenticates only once per role and does not expose credentials', async () => {
    const credentials = vi.fn(() => ({ username: 'admin@example.test', password: 'private-password' }));
    const strategy = new PasswordAuthStrategy({ loginUrl: '/admin', credentials });
    const context: ExecutionContext = {
      executionId: 'exec', flowId: 'flow', baseUrl: 'https://cms.test', env: {}, variables: {}, secretVariableNames: [],
      artifactsDir: '/tmp/artifacts', evidenceDir: '/tmp/artifacts/evidence', tracesDir: '/tmp/artifacts/trace', logsDir: '/tmp/artifacts/logs', options: {},
    };

    const first = await strategy.authenticate(context, 'admin');
    const second = await strategy.authenticate(context, 'admin');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second.credentials)).not.toContain('private-password');
  });
});
