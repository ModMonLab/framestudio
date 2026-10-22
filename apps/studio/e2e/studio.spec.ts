import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKER = process.env.FRAME_TEST_WORKER_URL;

function sample(takes: boolean): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-')), 'Backup.frame');
  execFileSync(process.execPath, ['--import', 'tsx', path.join(repo, 'tools/demo/make-sample.ts'), dir, ...(takes ? ['--takes', 'fixture'] : [])], { cwd: repo });
  return dir;
}

async function openProject(page: Page, dir: string) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Project folder' }).fill(dir);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

/** Compares the preview canvas with the server's export renderer at the same time and size (FR-RND-01, NFR-03). */
async function previewMatchesServer(page: Page, t: number) {
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="stage-canvas"]') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, px: Array.from(d) };
  });
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const scene = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = scene.episodes[scene.project.episodes[0]].scenes[0];
  const png = await page.request.get(`/api/projects/${pid}/frame?scene=${sid}&t=${t}&width=${info.w}&height=${info.h}&captions=true`);
  const ref = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, c.width, c.height).data);
  }, (await png.body()).toString('base64'));
  expect(ref.length).toBe(info.px.length);
  let diff = 0;
  for (let i = 0; i < ref.length; i += 4) if (Math.max(Math.abs(ref[i]! - info.px[i]!), Math.abs(ref[i + 1]! - info.px[i + 1]!), Math.abs(ref[i + 2]! - info.px[i + 2]!)) > 2) diff++;
  // Identical renderer and evaluation: no pixel may differ beyond PNG/canvas colour rounding.
  expect(diff / (ref.length / 4)).toBe(0);
}

test('workspace opens a project, previews with the export renderer, edits through commands, and passes axe (UI-01, FR-RND-01)', async ({ page }) => {
  await openProject(page, sample(true));
  await page.waitForTimeout(1500);
  await previewMatchesServer(page, 0);
  // Select Maya from Layers; the timeline and toolbar follow (shared selection).
  await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('Maya Bennett');
  // Edit through the Properties panel and undo it.
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByRole('button', { name: /^View: / }).click();
  await page.getByRole('option', { name: 'Front' }).click();
  await expect(page.getByRole('button', { name: 'View: Front' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo/ }).first()).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'View: ¾' })).toBeVisible();
  // Seek with the keyboard and compare the preview with the server again (lip sync and captions at 2 s).
  await page.locator('body').click({ position: { x: 5, y: 895 } });
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 96000);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('agent changes are tagged and a person reverts the agent session from Activity (FR-AGT-04/05, AC-13)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const speaker = st.scenes[sid].instances.find((i: { kind: string }) => i.kind === 'character').id;
  // What an MCP agent does: commands with its session header.
  const r = await page.request.post(`/api/projects/${pid}/commands`, { headers: { 'x-frame-agent': 'e2e-agent' }, data: { label: 'Agent line', commands: [{ name: 'line.add', params: { scene: sid, speaker, text: 'An agent wrote this line.', start: 48000 * 6, durationS: 2 } }] } });
  expect(r.ok()).toBe(true);
  const clip = page.getByRole('button', { name: /An agent wrote this line.*added by an agent/ });
  await expect(clip).toBeVisible();
  await page.getByRole('button', { name: /^Activity/ }).click();
  const activity = page.getByRole('dialog', { name: 'Activity' });
  await expect(activity.getByText('Agent e2e-agent', { exact: true })).toBeVisible();
  await expect(activity.getByRole('list', { name: 'Recent changes' })).toContainText('Agent line');
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await activity.getByRole('button', { name: 'Revert session' }).click();
  await expect(clip).toBeHidden();
  await expect(activity.getByRole('button', { name: 'Revert session' })).toBeDisabled();
  // The revert is one undoable step.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(clip).toBeVisible();
});

test.describe(() => {
  test.skip(!WORKER, 'needs FRAME_TEST_WORKER_URL');
  test('M1 slice in the Studio: design voices, emotional range, generate aligned takes, export (FR-VOI-02/03/07/10, FR-RND-07)', async ({ page }) => {
    await openProject(page, sample(false));
    for (const [who, desc] of [['Maya Bennett', 'Warm, articulate radio host in her thirties'], ['Leo Park', 'Dry, playful co-host in his late twenties']] as const) {
      await page.getByRole('treeitem', { name: new RegExp(who) }).first().click();
      await page.getByRole('tab', { name: 'Audio' }).click();
      await page.getByRole('button', { name: /Design a voice/ }).click();
      const dlg = page.getByRole('dialog', { name: 'Design a voice' });
      await dlg.getByLabel('Description').fill(desc);
      await dlg.getByRole('button', { name: /Generate candidates/ }).click();
      await dlg.getByRole('button', { name: 'Choose' }).first().click();
      await expect(dlg.getByText(/fixture worker|not real speech/).first()).toBeVisible();
      await dlg.getByRole('button', { name: 'Save voice' }).click();
      await expect(dlg).toBeHidden();
      if (who === 'Maya Bennett') {
        // Emotional range bank → a new voice version adopted by the character (FR-VOI-03, FR-VOI-10).
        await page.getByRole('button', { name: 'Emotional range…' }).click();
        const range = page.getByRole('dialog', { name: /^Emotional range/ });
        await range.getByRole('button', { name: 'Render emotions' }).click();
        await range.getByRole('switch', { name: 'Accept Happy' }).click({ timeout: 60_000 });
        await range.getByRole('button', { name: 'Save as version 2' }).click();
        await expect(range).toBeHidden();
        await expect(page.getByText(/Emotions: .*happy.* · version 2/)).toBeVisible();
      }
      await page.getByRole('button', { name: 'Generate takes' }).click();
      await expect(page.getByRole('list', { name: 'Takes' })).toContainText('Chosen', { timeout: 60_000 });
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exp = page.getByRole('dialog', { name: 'Export' });
    await expect(exp.getByText('Ready to export.')).toBeVisible();
    await exp.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: /^Jobs/ }).click();
    const jobs = page.getByRole('dialog', { name: 'Jobs' });
    // Fixture output must be labelled; real engines must not be.
    const fixture = (await (await page.request.get('/api/worker/status')).json()).fixture === true;
    const row = jobs.locator('.fr-job', { hasText: 'Export ·' }).first();
    await expect(row).toContainText(fixture ? 'Completed · contains fixture audio (not real speech)' : 'Completed', { timeout: 150_000 });
    if (!fixture) await expect(row).not.toContainText('fixture');
    // The finished export opens in the in-app player.
    await jobs.getByRole('button', { name: 'Play' }).click();
    const player = page.getByRole('dialog', { name: /^Export · / });
    await expect(player.locator('video, [role="alert"]').first()).toBeVisible();
    // The player streams the file from the project folder with byte ranges (seeking).
    const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
    const job = (await (await page.request.get(`/api/jobs?project=${pid}`)).json()).jobs.find((j: { kind: string }) => j.kind === 'render');
    const res = await page.request.get(`/api/projects/${pid}/files?path=${encodeURIComponent(job.result.output)}`, { headers: { range: 'bytes=0-99' } });
    expect(res.status()).toBe(206);
    expect(res.headers()['content-type']).toBe('video/mp4');
  });
});
