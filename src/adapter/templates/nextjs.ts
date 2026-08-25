export function generateNextjsConfig(baseUrl = 'http://localhost:3000'): string {
  return `import { defineConfig, SessionAuthStrategy, PasswordAuthStrategy } from 'intentproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || '${baseUrl}',
  defaultExecutor: 'playwright',
  flowsDir: './flows',
  artifactsDir: './artifacts',
  auth: {
    // NextAuth / Session-based auth
    user: new SessionAuthStrategy({
      cookieName: '__Secure-next-auth.session-token',
      storageKey: 'nextauth.message',
      getToken: () => process.env.TEST_SESSION_TOKEN || 'mock-nextauth-token',
    }),
    // Alternatively, form login
    credentialsUser: new PasswordAuthStrategy({
      loginUrl: '/api/auth/signin',
      usernameField: 'input[name="email"]',
      passwordField: 'input[name="password"]',
      submitField: 'button[type="submit"]',
      credentials: () => ({
        username: process.env.TEST_USER_EMAIL || 'user@example.com',
        password: process.env.TEST_USER_PASSWORD || 'password123',
      }),
    }),
  },
  options: {
    headless: true,
    timeoutMs: 15000,
    recordTrace: true,
  },
});
`;
}
