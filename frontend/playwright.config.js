import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const web = 'http://127.0.0.1:5178';
const backend = 'http://127.0.0.1:4181';
const database = 'jdbc:h2:mem:bughit_e2e;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1';

export default defineConfig({
  testDir: 'tests', testMatch: '**/*.spec.js', timeout: 65000, workers: 2, forbidOnly: Boolean(process.env.CI),
  use: { baseURL: web, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'], defaultBrowserType: 'webkit' } }
  ],
  webServer: [
    { command: 'java -XX:ActiveProcessorCount=2 -jar target/bug-hit-1.0.0.jar', cwd: resolve(import.meta.dirname, '..'),
      url: `${backend}/actuator/health`, timeout: 90000,
      env: { PORT: '4181', DATABASE_URL: process.env.TEST_DATABASE_URL || database, JWT_SECRET: 'isolated-test-signing-secret-for-bug-hit' } },
    { command: 'npm run dev -- --port 5178 --strictPort', url: web, timeout: 90000, env: { BUG_HIT_BACKEND: backend } }
  ]
});
