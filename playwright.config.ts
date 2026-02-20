import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'publish-complaint',
      use: {
        browserName: 'chromium',
        // CI=true  → headless com viewport fixo (GitHub Actions)
        // CI vazio → browser visível maximizado (uso local)
        headless: !!process.env.CI,
        viewport: process.env.CI ? { width: 1280, height: 720 } : null,
        // User-Agent realista para evitar detecção de bot no PROD
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        launchOptions: {
          slowMo: process.env.CI ? 0 : 150,
          // Perfil persistente no CI: reutiliza cookies/estado entre runs (pode reduzir desafios Cloudflare)
          ...(process.env.CI && process.env.PLAYWRIGHT_BROWSER_PROFILE_DIR
            ? { userDataDir: process.env.PLAYWRIGHT_BROWSER_PROFILE_DIR }
            : {}),
          args: process.env.CI
            ? [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
              ]
            : ['--start-maximized'],
        },
      },
      testMatch: '**/publish-complaint.spec.ts',
      timeout: 300_000, // 5 min — cobre networkidle + hidratação SSR em PROD/CI
    },
    {
      name: 'benchmark-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      },
      testMatch: '**/complaint-flow-benchmark.spec.ts',
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/complaint-flow-benchmark.spec.ts',
        '**/publish-complaint.spec.ts',
      ],
    },
  ],
});
