export class SecretRedactor {
  private customPatterns: RegExp[] = [];
  private knownSecrets: Set<string> = new Set();

  private static ignoredCommonWords = new Set([
    'true',
    'false',
    'null',
    'undefined',
    'none',
    'development',
    'production',
    'staging',
    'test',
    'evidence',
    'artifacts',
    'playwright',
    'chromium',
    'firefox',
    'webkit',
    'orchestrator',
    'console',
    'network',
    'result',
    'summary',
  ]);

  constructor(customPatterns: RegExp[] = []) {
    this.customPatterns = customPatterns;
  }

  /**
   * Register a known secret string to always mask (e.g. from env vars).
   */
  public registerSecret(secret: string): void {
    if (!secret || typeof secret !== 'string') return;
    const trimmed = secret.trim();
    if (
      trimmed.length >= 8 &&
      !SecretRedactor.ignoredCommonWords.has(trimmed.toLowerCase())
    ) {
      this.knownSecrets.add(trimmed);
    }
  }

  /**
   * Register multiple secret strings (e.g. from process.env).
   */
  public registerEnvSecrets(env: Record<string, string | undefined>): void {
    const sensitiveKeys = ['SECRET', 'PASSWORD', 'TOKEN', 'KEY', 'AUTH', 'CREDENTIAL'];
    for (const [k, v] of Object.entries(env)) {
      if (
        v &&
        sensitiveKeys.some((s) => k.toUpperCase().includes(s)) &&
        !k.toUpperCase().includes('PATH') &&
        !k.toUpperCase().includes('DIR')
      ) {
        this.registerSecret(v);
      }
    }
  }

  /**
   * Redact sensitive information from a string.
   */
  public redact(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let sanitized = text;

    // Redact known exact secret strings
    for (const secret of this.knownSecrets) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED_SECRET]');
    }

    // Redact Bearer and Basic headers
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Basic [REDACTED]');

    // Redact JSON / key-value secrets
    sanitized = sanitized.replace(
      /("?(?:password|secret|api[_-]?key|token|authorization)"?\s*[:=]\s*)"([^"]+)"/gi,
      '$1"[REDACTED]"'
    );

    // Redact specific known token formats
    sanitized = sanitized.replace(/ghp_[A-Za-z0-9]{36}/gi, 'ghp_[REDACTED]');
    sanitized = sanitized.replace(/xox[baprs]-[A-Za-z0-9-]{10,}/gi, 'xox-[REDACTED]');
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/gi, 'eyJ[REDACTED_JWT]');

    // Redact custom patterns
    for (const pattern of this.customPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * Redact sensitive information from an object recursively.
   */
  public redactObject<T>(obj: T): T {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return this.redact(obj) as unknown as T;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        // Do not redact file path fields
        if (
          lowerKey === 'path' ||
          lowerKey === 'absolutepath' ||
          lowerKey === 'resultjson' ||
          lowerKey === 'summarymarkdown' ||
          lowerKey === 'artifactsdir' ||
          lowerKey === 'evidencedir' ||
          lowerKey === 'tracesdir' ||
          lowerKey === 'logsdir' ||
          lowerKey === 'consolelog' ||
          lowerKey === 'networklog' ||
          lowerKey === 'orchestratorlog' ||
          lowerKey === 'trace' ||
          lowerKey === 'video'
        ) {
          result[key] = value;
          continue;
        }

        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('authorization') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key')
        ) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as T;
    }
    return obj;
  }
}
