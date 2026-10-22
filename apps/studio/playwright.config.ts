import os from 'node:os';
import path from 'node:path';
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
    // A throwaway user library: tests never touch the real profile (FR-AST-01).
    // Deleting a project moves it to a throwaway trash, never the real one.
    env: { FRAME_USER_DIR: path.join(os.tmpdir(), `frame-e2e-user-${Date.now()}`, 'library'), XDG_DATA_HOME: path.join(os.tmpdir(), `frame-e2e-data-${Date.now()}`), ...(process.env.FRAME_TEST_WORKER_URL ? { FRAME_WORKER_URL: process.env.FRAME_TEST_WORKER_URL } : {}) },
  },
});
