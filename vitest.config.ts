import { defineConfig } from 'vitest/config'

/**
 * Vitest config for FitFix.
 *
 * Two project layers:
 *   - tests/api/**       run in plain Node (no DOM). This is the
 *                        MCP-server-ready surface — anything that needs
 *                        `window` / `document` / `localStorage` does NOT
 *                        belong here.
 *   - tests/dom/**       run with jsdom for the few React hooks / store
 *                        modules that need a DOM environment. Empty for
 *                        now; reserved.
 *
 * `tests/e2e/**` is Playwright, run separately.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/api-setup.ts'],
        },
      },
      {
        // tests/dom/ is currently empty — every src/lib/ module is
        // Node-runnable post-xmldom swap. Reserved for future React
        // component / hook tests.
        test: {
          name: 'dom',
          include: ['tests/dom/**/*.test.ts', 'tests/dom/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/persist.ts',
        'src/lib/download.ts',
        'src/lib/usePreview.ts',
        'src/lib/plugins/index.ts',
        'src/lib/edits/*/register.ts',
        'src/lib/edits/*/Panel.tsx',
        '**/*.d.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
