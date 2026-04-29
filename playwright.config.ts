import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for FitFix.
 *
 * - Runs against `npm run preview` (the production build), NOT the dev
 *   server. HMR + Vite-Lightning intermediate states make `vite` flaky
 *   for end-to-end specs.
 * - Single Chromium project for now; add Firefox / WebKit when the
 *   spec set is stable. Most regressions show up in any modern engine.
 * - `webServer.reuseExistingServer = !CI` so locally we don't restart
 *   preview on every run while iterating; CI always boots fresh.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // We deliberately skip `tsc -b` here — there are pre-existing
    // type errors on the in-progress unified-editor refactor that the
    // runtime build doesn't care about. The vitest `tsconfig.test.json`
    // pass and a separate `tsc` CI step are the right place to gate
    // type errors; e2e tests assert runtime behaviour.
    // Build is run separately via the npm `pretest:e2e` hook so we don't
    // chain commands here (Playwright's shell spawn occasionally drops
    // long-running compound commands, see git history).
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
