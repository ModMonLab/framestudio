import { defineConfig } from '@playwright/test';

/** Visual regression for every component state in both themes at 1440×900 and 1280×720 (UI-07, AC-18). */
export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: 'disabled' } },
  webServer: { command: 'npx vite --port 5181 --strictPort', port: 5181, reuseExistingServer: true, cwd: '.' },
  // Reduced motion gives spinners and indeterminate bars their designed static state on every runner.
  use: { baseURL: 'http://localhost:5181', deviceScaleFactor: 1, reducedMotion: 'reduce' },
  projects: [
    { name: 'ref', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'min', use: { viewport: { width: 1280, height: 720 } } },
  ],
});
