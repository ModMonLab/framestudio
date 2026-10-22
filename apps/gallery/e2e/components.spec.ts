import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const stories = ['buttons', 'fields', 'controls', 'choices', 'menus', 'trees', 'sections', 'lists', 'feedback', 'shell'];

for (const theme of ['dark', 'light']) {
  for (const story of stories) {
    test(`${story} · ${theme}`, async ({ page }, info) => {
      await page.goto(`/?theme=${theme}&story=${story}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${story}-${theme}-${info.project.name}.png`, { fullPage: true });
    });
  }
  test(`axe: no WCAG A/AA violations · ${theme}`, async ({ page }) => {
    await page.goto(`/?theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
