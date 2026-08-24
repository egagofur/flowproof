export function generateGenericConfig(baseUrl = 'http://localhost:3000'): string {
  return `import { defineConfig, PasswordAuthStrategy } from 'flowproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || '${baseUrl}',
  defaultExecutor: 'playwright',
  flowsDir: './flows',
  artifactsDir: './artifacts',
  retentionDays: 14,
  auth: {
    // Example: Password form authentication
    user: new PasswordAuthStrategy({
      loginUrl: '/login',
      usernameField: 'input[name="email"], input[type="email"]',
      passwordField: 'input[name="password"], input[type="password"]',
      submitField: 'button[type="submit"]',
      credentials: () => ({
        username: process.env.TEST_USER_EMAIL || 'user@example.com',
        password: process.env.TEST_USER_PASSWORD || 'password123',
      }),
      validateSuccess: async (page) => {
        await page.waitForURL('**/dashboard', { timeout: 10000 });
      },
    }),
  },
  customActions: {
    // Register project-specific custom step handlers here
  },
  customAssertions: {
    // Register project-specific custom assertions here
  },
});
`;
}
