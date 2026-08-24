import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '../../src/core/security/secret-redactor.js';

describe('SecretRedactor', () => {
  it('should redact bearer tokens and authorization headers', () => {
    const redactor = new SecretRedactor();
    const input = 'Request sent with Authorization: Bearer abc123def456ghi789 and token: "my-secret-token"';
    const result = redactor.redact(input);

    expect(result).not.toContain('abc123def456ghi789');
    expect(result).not.toContain('my-secret-token');
    expect(result).toContain('Bearer [REDACTED]');
  });

  it('should redact exact registered environment secrets', () => {
    const redactor = new SecretRedactor();
    redactor.registerSecret('SUPER_SECRET_VALUE_123');

    const input = 'Database connected with password: SUPER_SECRET_VALUE_123 in url';
    const result = redactor.redact(input);

    expect(result).not.toContain('SUPER_SECRET_VALUE_123');
    expect(result).toContain('[REDACTED_SECRET]');
  });

  it('should redact nested objects recursively', () => {
    const redactor = new SecretRedactor();
    const obj = {
      user: 'alice',
      password: 'password123',
      nested: {
        token: 'secret-token-xyz',
        publicField: 'safe data',
      },
    };

    const redacted = redactor.redactObject(obj);
    expect(redacted.user).toBe('alice');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.nested.token).toBe('[REDACTED]');
    expect(redacted.nested.publicField).toBe('safe data');
  });
});
