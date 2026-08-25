export function generateViteConfig(baseUrl = 'http://localhost:5173'): string {
  return `import { defineConfig, TokenAuthStrategy, PasswordAuthStrategy } from 'intentproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || '${baseUrl}',
  defaultExecutor: 'playwright',
  flowsDir: './flows',
  artifactsDir: './artifacts',
  auth: {
    // Bearer token auth for SPA / API
    user: new TokenAuthStrategy({
      headerName: 'Authorization',
      prefix: 'Bearer ',
      getToken: () => process.env.TEST_JWT_TOKEN || 'mock-jwt-token',
    }),
    // Form login
    formUser: new PasswordAuthStrategy({
      loginUrl: '/login',
      usernameField: 'input[name="username"], input[name="email"]',
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
