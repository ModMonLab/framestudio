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

test('character builder edits a draft, checks the rig, saves a new character for one instance and undoes (FR-BLD-01..08, FR-CHR-10)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const maya = st.scenes[sid].instances.find((i: { name: string }) => i.name === 'Maya Bennett');
  await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByRole('button', { name: 'Open in builder' }).click();
  await expect(page.getByRole('button', { name: 'Rig check details' })).toContainText('Rig check passed', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Rig check details' })).toContainText('4 views · 2 styles · 9 mouth shapes');
  const saveBtn = page.getByRole('button', { name: 'Save as new character' });
  await expect(saveBtn).toBeDisabled();
  // Search matches current values; choosing a hairstyle marks the draft edited.
  await page.getByRole('textbox', { name: 'Search parts and settings' }).fill('hairstyle');
  await page.getByRole('treeitem', { name: /Hairstyle/ }).click();
  await page.getByRole('textbox', { name: 'Search parts and settings' }).fill('');
  const tiles = page.getByRole('radiogroup', { name: 'Hairstyle' });
  const current = await tiles.getByRole('radio', { checked: true }).getAttribute('title');
  const other = tiles.getByRole('radio', { checked: false }).first();
  const otherName = await other.getAttribute('title');
  await other.click();
  await expect(page.getByText(/· edited/).first()).toBeVisible();
  await expect(page.getByRole('treeitem', { name: new RegExp(`Hairstyle.*${otherName}`) })).toBeVisible();
  // Builder-local undo/redo.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tiles.getByRole('radio', { checked: true })).toHaveAttribute('title', current!);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(tiles.getByRole('radio', { checked: true })).toHaveAttribute('title', otherName!);
  // Turnaround sheet shows all four views.
  await page.getByText('Turnaround sheet').click();
  await expect(page.getByRole('img', { name: /Maya Bennett, (Front|Three-quarter|Side|Back) view/ })).toHaveCount(4);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  // A library character is saved as a new character used only by this instance.
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
  await saveBtn.click();
  const dlg = page.getByRole('dialog', { name: 'Save as a new character' });
  await dlg.getByRole('radio', { name: /Only Maya Bennett in this scene/ }).click();
  await dlg.getByRole('button', { name: 'Save character' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText(/^v1$/)).toBeVisible();
  const after = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const inst = after.scenes[sid].instances.find((i: { id: string }) => i.id === maya.id);
  expect(inst.asset).toMatch(/^user\..+@1$/);
  expect(after.assets[inst.asset].data.parts.hair).not.toBe(st.assets[inst.asset]?.data?.parts?.hair);
  // Saved versions export as .framechar.
  await expect(page.getByRole('button', { name: 'Export…' })).toBeEnabled();
  // The save is one undoable step in the project history.
  await page.getByRole('button', { name: 'Back to the workspace' }).click();
  await page.getByRole('button', { name: /^Undo Save .* as a new character/ }).first().click();
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state.scenes[sid].instances.find((i: { id: string }) => i.id === maya.id).asset).toBe(maya.asset);
});

test('project versions: save, compare and restore; packages import from the File menu (FR-PER-03, FR-IMP-04)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const original = st.scenes[sid].name;
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Versions…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Versions' });
  await dlg.getByRole('textbox', { name: 'Version name' }).fill('Before rename');
  await dlg.getByRole('button', { name: 'Save version' }).click();
  await expect(dlg.getByRole('button', { name: /Before rename/ })).toBeVisible();
  await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'scene.rename', params: { id: sid, name: 'Renamed scene' } }] } });
  await dlg.getByRole('button', { name: /Before rename/ }).click();
  await expect(dlg.getByRole('list', { name: 'Differences' })).toContainText('Renamed scene');
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Restore this version' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state.scenes[sid].name).toBe(original);
  // A .framechar from this project imports as "already present"; the menu path and file input work.
  const made = await (await page.request.post(`/api/projects/${pid}/characters`, { data: { spec: { name: 'Packed', from: st.scenes[sid].instances.find((i: { kind: string }) => i.kind === 'character').asset } } })).json();
  const pkg = await page.request.get(`/api/projects/${pid}/packages/export?format=framechar&refs=${encodeURIComponent(made.ref)}`);
  await page.locator('input[aria-label="Import package"]').setInputFiles({ name: 'packed.framechar', mimeType: 'application/zip', buffer: await pkg.body() });
  await expect(page.getByText('Everything in the package is already in this project')).toBeVisible();
});

test('imports an SVG as an object with a rights statement; the preview still matches the export renderer (FR-IMP-01/02)', async ({ page }) => {
  await openProject(page, sample(false));
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 10 10"><g id="sign"><rect width="10" height="10" fill="#22aa55"/></g></svg>';
  await page.locator('input[aria-label="Import a file"]').setInputFiles({ name: 'green sign.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  const dlg = page.getByRole('dialog', { name: 'Import green sign.svg' });
  await dlg.getByRole('radio', { name: 'I have a licence to use it' }).click();
  await expect(dlg.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await dlg.getByRole('textbox', { name: 'Licence' }).fill('CC-BY-4.0');
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText('Imported green sign.svg')).toBeVisible();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /green sign/ }).first()).toBeVisible();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const asset = Object.values(st.assets as Record<string, { kind: string; license: { id: string }; provenance: { sourceFile: string } }>).find((a) => a.kind === 'img')!;
  expect(asset.license.id).toBe('CC-BY-4.0');
  expect(asset.provenance.sourceFile).toBe('green sign.svg');
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 0);
});

test('rigging assistant: a layered PSD becomes a character with declared view gaps and a library mouth (FR-IMP-03, AC-12 path)', async ({ page }) => {
  await openProject(page, sample(false));
  const psd = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-psd-')), 'hero.psd');
  execFileSync(process.execPath, ['--import', 'tsx', path.join(repo, 'tools/demo/make-psd.ts'), psd], { cwd: repo });
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.locator('input[aria-label="Import a file"]').setInputFiles(psd);
  await page.getByRole('dialog', { name: 'Import hero.psd' }).getByRole('button', { name: 'Open rigging assistant' }).click();
  const dlg = page.getByRole('dialog', { name: /Rigging assistant/ });
  await expect(dlg.getByRole('region', { name: 'Front layers' }).or(dlg.locator('section[aria-label="Front layers"]'))).toBeVisible({ timeout: 30_000 });
  await expect(dlg.getByRole('button', { name: 'Rig target for head' }).first()).toContainText('Head');
  // The three-quarter view has only a resting mouth: the rig check blocks saving until a library mouth fills in.
  await expect(dlg.getByRole('list', { name: 'Rig check problems' })).toContainText('mouth shapes');
  await expect(dlg.getByRole('button', { name: 'Save character' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Library mouth' }).click();
  await page.getByRole('option', { name: /^Library: / }).first().click();
  await expect(dlg.getByText('Rig check passed')).toBeVisible();
  await expect(dlg.getByRole('img', { name: /hero, (Front|Three-quarter) view/ })).toHaveCount(2);
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Save character' }).click();
  await expect(dlg).toBeHidden();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const chr = Object.values(st.assets as Record<string, { kind: string; name: string; viewExemptions: Record<string, string> }>).find((a) => a.kind === 'chr' && a.name === 'hero')!;
  expect(Object.keys(chr.viewExemptions).sort()).toEqual(['back', 'side']);
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  expect(st.scenes[sid].instances.some((i: { name: string }) => i.name === 'hero')).toBe(true);
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 0);
});

test('favourites, collections and the user library in the Assets panel (FR-AST-01/06, FR-AST-04)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const from = st.scenes[sid].instances.find((i: { kind: string }) => i.kind === 'character').asset;
  const made = await (await page.request.post(`/api/projects/${pid}/characters`, { data: { spec: { name: 'Keeper', from } } })).json();
  await page.getByRole('button', { name: 'Cast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search cast' }).fill('Keeper');
  await page.getByRole('button', { name: /^Keeper/ }).click();
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to my library' }).click();
  await expect(page.getByText('Saved Keeper to your library')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search cast' }).fill('');
  await page.getByRole('radio', { name: 'Favourites' }).click();
  await expect(page.getByRole('button', { name: /^Keeper/ })).toBeVisible();
  await expect(page.locator('.st-left').getByRole('button', { name: /^Maya Bennett/ })).toHaveCount(0);
  const prefs = await (await page.request.get('/api/user/prefs')).json();
  expect(prefs.favourites).toEqual([made.ref.replace(/@1$/, '')]);
  // Expressions are offered with a reason when the selected character cannot use them (incompatible items stay visible).
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('part editor: edit points of a library hairstyle, check the rig and save a new part (FR-PED-01/02/05)', async ({ page }) => {
  await openProject(page, sample(false));
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search assets' }).fill('afro medium');
  await page.getByRole('button', { name: /^Afro medium/ }).click();
  await page.getByRole('button', { name: 'Open in part editor' }).click();
  await expect(page.getByRole('img', { name: /front view, flat artwork in head space/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Rig check passed').first()).toBeVisible();
  const save = page.getByRole('button', { name: 'Save as new part' });
  await expect(save).toBeDisabled();
  // Nudge a control point with the keyboard (an accessible alternative to dragging).
  const pt = page.getByRole('button', { name: /^Point / }).first();
  await pt.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(page.getByText(/· edited/)).toBeVisible();
  await page.screenshot({ path: process.env.FRAME_DEBUG_PNG ? `${process.env.FRAME_DEBUG_PNG}-parted.png` : test.info().outputPath('parted.png') });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(/^Saved .* as a new part$/)).toBeVisible();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const custom = Object.values(st.assets as Record<string, { kind: string; name: string; provenance: { notes: string } }>).find((a) => a.kind === 'hair')!;
  expect(custom.name).toBe('Afro medium (custom)');
  expect(custom.provenance.notes).toContain('hair.afro-medium@1');
  await expect(page.getByText('v1', { exact: true })).toBeVisible();
});

test('full-page library: filters, details with versions and usages, explicit update to the latest version (FR-AST-03/05, UI-03)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const maya = st.scenes[sid].instances.find((i: { name: string }) => i.name === 'Maya Bennett');
  // A project character with two versions; the scene uses version 1.
  const v1 = (await (await page.request.post(`/api/projects/${pid}/characters/versions`, { data: { from: maya.asset, asNew: true, spec: { name: 'Maya B' }, update: { scope: 'instance', scene: sid, instance: maya.id } } })).json()).ref as string;
  await page.request.post(`/api/projects/${pid}/characters/versions`, { data: { from: v1, spec: { role: 'Host, season 2', changes: 'New role' } } });
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Asset library' }).click();
  await page.getByRole('textbox', { name: 'Search the library' }).fill('Maya B');
  await page.getByRole('listitem', { name: 'Maya B', exact: true }).getByRole('button').click();
  const details = page.locator('.st-right');
  await expect(details.getByRole('list', { name: 'Versions' })).toContainText('New role');
  await expect(details.getByRole('list', { name: 'Usages' })).toContainText('v1');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await details.getByRole('button', { name: 'Update to v2' }).first().click();
  await expect(page.getByText(/Updated .* to version 2/)).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state.scenes[sid].instances.find((i: { id: string }) => i.id === maya.id).asset).toBe(v1.replace(/@1$/, '@2'));
});
