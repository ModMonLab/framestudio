import { defineConfig } from '@playwright/test';

/**
 * Studio end-to-end tests against a real Frame Server serving the built Studio. The voice flow needs a Voice Worker
 * (FRAME_TEST_WORKER_URL; CI runs the fixture engine — test signals, not real speech).
 */
const port = 4849;
export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', launchOptions: { args: ['--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning', '--force-color-profile=srgb'] } },
  webServer: {
    command: `pnpm exec vite build && node --import tsx ../../packages/cli/src/bin.ts server start --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...(process.env.FRAME_TEST_WORKER_URL ? { FRAME_WORKER_URL: process.env.FRAME_TEST_WORKER_URL } : {}) },
  },
});
