import { defineConfig } from '../../src/adapter/config.js';
import { PasswordAuthStrategy } from '../../src/adapter/auth/password-auth.js';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3344',
  defaultExecutor: 'playwright',
  auth: {
    employee: new PasswordAuthStrategy({
      loginUrl: '/login',
      usernameField: 'input#email',
      passwordField: 'input#password',
      submitField: 'button#btn-login',
      credentials: () => ({
        username: process.env.TEST_EMPLOYEE_EMAIL || 'employee@company.com',
        password: process.env.TEST_EMPLOYEE_PASSWORD || 'secret123',
      }),
      validateSuccess: async (page) => {
        await page.waitForSelector('#dashboard-view:not(.hidden)', { timeout: 5000 });
      },
    }),
  },
  customActions: {
    select_date: async (page, step) => {
      const targetSelector = step.target || 'input[type="date"]';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await page.fill(targetSelector, dateStr);
    },
  },
});
