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
async function previewMatchesServer(page: Page, t: number, sceneId?: string) {
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="stage-canvas"]') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, px: Array.from(d) };
  });
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const scene = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = sceneId ?? scene.episodes[scene.project.episodes[0]].scenes[0];
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

// Onboarding has its own test; every other test starts as a returning user.
test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('first run')) return;
  await page.addInitScript(() => localStorage.setItem('frame.prefs', JSON.stringify({ onboarded: true, tourDone: true })));
});

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

test('auto performance adds editable clips; a same-channel overlap is hatched and listed; dragging a clip moves it (FR-ACT-07/08, FR-CAM-07, AC-10)', async ({ page }) => {
  await openProject(page, sample(true));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  await page.getByRole('button', { name: 'Auto performance' }).click();
  await expect(page.getByText(/Added \d+ automatic clips/)).toBeVisible();
  st = await state();
  const autoClips = st.scenes[sid].clips.filter((c: { source: string }) => c.source === 'auto');
  expect(autoClips.length).toBeGreaterThan(0);
  // A second point-at overlapping Leo's on the same arm channel is a conflict: hatched, and blocks export.
  const leo = st.scenes[sid].instances.find((i: { name: string }) => i.name === 'Leo Park').id;
  const acting = st.scenes[sid].tracks.find((t: { owner: string; kind: string }) => t.owner === leo && t.kind === 'acting').id;
  const r = await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'clip.add', params: { scene: sid, track: acting, start: 6 * 48000, end: 7 * 48000, asset: 'act.point-at@1' } }] } });
  expect(r.ok()).toBe(true);
  await expect(page.getByRole('button', { name: /point at, in conflict/i }).first()).toBeVisible();
  const problems = (await (await page.request.get(`/api/projects/${pid}/validate`)).json()).problems;
  expect(problems.some((p: { code: string; blocksExport: boolean }) => p.code === 'CHANNEL_CONFLICT' && p.blocksExport)).toBe(true);
  // Drag the new clip to the right: it moves through clip.move and the conflict clears once it no longer overlaps.
  const added = (await r.json()).commands[0].params.id;
  const chip = page.getByRole('button', { name: /point at, in conflict/i }).last();
  await chip.scrollIntoViewIfNeeded();
  const box = (await chip.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 5 + 200, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).scenes[sid].clips.find((c: { id: string }) => c.id === added).start).toBeGreaterThan(6 * 48000);
});

test('dropping a character on a chair seats it on the seat anchor, in front of the chair (FR-STG-04)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const add = await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'instance.add', params: { scene: sid, kind: 'prop', asset: 'prop.studio-chair@1', name: 'Spare chair', transform: { x: 300, y: 985 }, depthPlane: 'mid' } }] } });
  const chair = (await add.json()).commands[0].params.id;
  st = await state();
  const maya = st.scenes[sid].instances.find((i: { name: string }) => i.name === 'Maya Bennett');
  // Wait until the Studio has the new chair (it arrives over the live connection).
  await expect(page.getByRole('treeitem', { name: /Spare chair/ }).first()).toBeVisible();
  // The wide camera shows the whole stage (centre 960,560, width 1920): stage → canvas is a uniform scale.
  // Wait until the canvas has settled (fonts and panels can resize it just after load); the drop maps through it.
  const canvas = page.getByTestId('stage-canvas');
  let box = (await canvas.boundingBox())!;
  await expect.poll(async () => {
    await page.waitForTimeout(250);
    const b = (await canvas.boundingBox())!;
    const same = Math.abs(b.width - box.width) < 0.5 && Math.abs(b.x - box.x) < 0.5 && Math.abs(b.y - box.y) < 0.5;
    box = b;
    return same;
  }).toBe(true);
  const k = box.width / 1920;
  const toScreen = (x: number, y: number) => [box.x + x * k, box.y + (y - 20) * k] as const;
  const [x0, y0] = toScreen(maya.transform.x, maya.transform.y - 420); // her head, above the chair she sits on
  const [x1, y1] = toScreen(300, maya.transform.y - 420);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
  // Seated on the spare chair: the seat command (not a plain move) ran.
  await expect(page.getByRole('button', { name: /^Undo Seat Maya Bennett on Spare chair/ }).first()).toBeVisible();
  await expect.poll(async () => (await state()).scenes[sid].instances.find((i: { id: string }) => i.id === maya.id).transform.x, { timeout: 10_000 }).toBeLessThan(400);
  st = await state();
  const m = st.scenes[sid].instances.find((i: { id: string }) => i.id === maya.id);
  const c = st.scenes[sid].instances.find((i: { id: string }) => i.id === chair);
  expect(m.character.posture).toBe('seated');
  expect(m.depthPlane).toBe(c.depthPlane);
  expect(m.order).toBeGreaterThan(c.order);
  await expect(page.getByRole('button', { name: /^Undo Seat Maya Bennett on Spare chair/ }).first()).toBeVisible();
});

test('a character uses an object from the Acting tab; the sound cue lands on the Sound track and plays bundled media (FR-ACT-06, FR-PRP-02, FR-SND-04)', async ({ page }) => {
  await openProject(page, sample(true));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
  await page.getByRole('tab', { name: 'Acting' }).click();
  await page.getByRole('group', { name: 'Use Mug' }).getByRole('button', { name: 'Drink from mug' }).click();
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  await expect.poll(async () => {
    const st = await state();
    const sid = st.episodes[st.project.episodes[0]].scenes[0];
    return st.scenes[sid].clips.filter((c: { asset?: string }) => c.asset === 'sfx.mug-on-table@1').length;
  }).toBe(1);
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const drink = st.scenes[sid].clips.find((c: { asset?: string }) => c.asset === 'act.drink-from-mug@1');
  const mug = st.scenes[sid].instances.find((i: { name: string }) => i.name === 'Mug');
  expect(drink.params.prop).toBe(mug.id);
  await expect(page.getByRole('button', { name: /Sound FX: contact \(cue\)/ })).toBeVisible();
  // The cue's media is bundled content, served through the project media route for playback.
  const man = await (await page.request.get(`/api/library/manifest?ref=${encodeURIComponent('sfx.mug-on-table@1')}`)).json();
  const hash = (man.manifest ?? man).data.sound.media.hash;
  const media = await page.request.get(`/api/projects/${pid}/media/${hash}`);
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toContain('audio/wav');
  // Mid-drink the preview still matches the export renderer (the mug is in her hand).
  await page.locator('body').click({ position: { x: 5, y: 895 } });
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 96000);
});

test('applies a line-anchored recipe from the Assets panel and generates coverage; shots never overlap (FR-RCP-01..03, FR-CAM-05)', async ({ page }) => {
  await openProject(page, sample(true));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('searchbox', { name: /^Search/ }).or(page.getByRole('textbox', { name: /^Search/ })).first().fill('Listen and nod');
  await page.getByRole('button', { name: /^Listen and nod/ }).first().click();
  await page.getByRole('button', { name: 'Apply…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Apply Listen and nod' });
  await expect(dlg.getByRole('button', { name: /^Speaker/ })).toContainText('Maya Bennett');
  await expect(dlg.getByRole('button', { name: /^Listener/ })).toContainText('Leo Park');
  await expect(dlg.getByRole('button', { name: /^Line/ })).toContainText('Welcome back');
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText(/Listen and nod: 5 clips added as one group/)).toBeVisible();
  let st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const group = st.scenes[sid].clips.filter((c: { source: string }) => c.source === 'recipe:rcp.listen-and-nod@1');
  expect(group).toHaveLength(5);
  expect(new Set(group.map((c: { group: string }) => c.group)).size).toBe(1);
  await page.getByRole('button', { name: 'Auto coverage' }).click();
  await expect(page.getByText(/shots on the Shot track/)).toBeVisible();
  st = await state();
  const shotTrack = st.scenes[sid].tracks.find((t: { kind: string }) => t.kind === 'shot').id;
  const shots = st.scenes[sid].clips.filter((c: { track: string }) => c.track === shotTrack).sort((a: { start: number }, b: { start: number }) => a.start - b.start);
  expect(shots.length).toBeGreaterThan(2);
  for (let i = 1; i < shots.length; i++) expect(shots[i].start).toBeGreaterThanOrEqual(shots[i - 1].end);
  const problems = (await (await page.request.get(`/api/projects/${pid}/validate`)).json()).problems;
  expect(problems.filter((p: { code: string }) => p.code === 'SHOT_OVERLAP' || p.code === 'CHANNEL_CONFLICT')).toEqual([]);
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 0);
});

test('atmosphere, effects and a shot transition added from the Assets panel preview exactly like the export (FR-FX-01..04)', async ({ page }) => {
  await openProject(page, sample(true));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const search = page.getByRole('searchbox', { name: /^Search/ }).or(page.getByRole('textbox', { name: /^Search/ })).first();
  for (const name of ['Heavy rain', 'Golden hour']) {
    await search.fill(name);
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
    await page.getByRole('button', { name: 'Add at playhead' }).click();
  }
  await search.fill('Crossfade');
  await page.getByRole('button', { name: /^Crossfade/ }).first().click();
  await page.getByRole('button', { name: 'Add to scene' }).click();
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const assets = st.scenes[sid].clips.map((c: { asset?: string }) => c.asset);
  expect(assets).toContain('atmo.heavy-rain@1');
  expect(assets).toContain('atmo.golden-hour@1');
  expect(st.scenes[sid].clips.some((c: { params: { transition?: string } }) => c.params.transition === 'tr.crossfade@1')).toBe(true);
  await page.waitForTimeout(1000);
  await previewMatchesServer(page, 0);
});

test('a speech bubble added for the selected character uses the line they speak and previews like the export (FR-TXT-03)', async ({ page }) => {
  await openProject(page, sample(true));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  await page.getByRole('treeitem', { name: /Leo Park/ }).first().click();
  // Seek to 6 s (Leo speaks from 5 s).
  await page.locator('body').click({ position: { x: 5, y: 895 } });
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('searchbox', { name: /^Search/ }).or(page.getByRole('textbox', { name: /^Search/ })).first().fill('Speech bubble round');
  await page.getByRole('button', { name: /^Speech bubble round/ }).first().click();
  await page.getByRole('button', { name: 'Add at playhead' }).click();
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  await expect.poll(async () => {
    const st = await state();
    const sid = st.episodes[st.project.episodes[0]].scenes[0];
    return st.scenes[sid].clips.filter((c: { asset?: string }) => c.asset === 'txt.speech-bubble-round@1').length;
  }).toBe(1);
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const bubble = st.scenes[sid].clips.find((c: { asset?: string }) => c.asset === 'txt.speech-bubble-round@1');
  const line = st.scenes[sid].clips.find((c: { id: string }) => c.id === bubble.params.line);
  expect(line.line.text).toContain('forgot to start');
  expect(bubble.start).toBe(line.start);
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 6 * 48000);
});

test('timeline editing: a trim snaps to a marker, S splits at the playhead, I/O set the loop (FR-TML-02/04)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const point = st.scenes[sid].clips.find((c: { asset?: string }) => c.asset === 'act.point-at@1');
  // Marker at 9 s with the keyboard.
  await page.locator('body').click({ position: { x: 5, y: 895 } });
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('m');
  await expect.poll(async () => (await state()).scenes[sid].markers.length).toBe(1);
  await page.getByRole('button', { name: 'Zoom to fit' }).click();
  // The focus click above may land on a group header; make sure Leo's lanes are open.
  const leoGroup = page.getByRole('button', { name: /^Leo Park \d+$/ });
  if ((await leoGroup.getAttribute('aria-expanded')) !== 'true') await leoGroup.click();
  // Drag the end of Leo's point-at clip (ends at 7.8 s) toward the marker: it snaps to 9 s.
  const chip = page.getByRole('button', { name: /^Acting: Point at/ }).first();
  await chip.scrollIntoViewIfNeeded();
  const box = (await chip.boundingBox())!;
  const marker = (await page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: 'Marker Marker 1' }).boundingBox())!;
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(marker.x + marker.width / 2 + 3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).scenes[sid].clips.find((c: { id: string }) => c.id === point.id).end).toBe(9 * 48000);
  // Split it at 8.5 s with S.
  await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await chip.click();
  await page.keyboard.press('s');
  await expect.poll(async () => (await state()).scenes[sid].clips.filter((c: { asset?: string }) => c.asset === 'act.point-at@1').length).toBe(2);
  // Loop in at 8.5 s, out at 9.5 s.
  await page.keyboard.press('i');
  for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('o');
  await expect.poll(async () => (await state()).scenes[sid].loop).toEqual({ start: 8.5 * 48000, end: 9.5 * 48000 });
  st = await state();
  expect(st.scenes[sid].markers[0].at).toBe(9 * 48000);
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
  // Compare shows the saved version next to the changes (FR-BLD-03).
  await page.getByText('Compare', { exact: true }).click();
  await expect(page.getByRole('img', { name: /saved version$/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /with your changes$/ })).toBeVisible();
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
  // A joint set by clicking the layer, and the library hand set for hand poses (FR-IMP-03).
  await dlg.getByRole('button', { name: /^Set the joint of upper_arm_L/ }).first().click();
  const joint = page.getByRole('dialog', { name: /^Joint · upper_arm_L/ });
  const img = (await joint.getByRole('img').boundingBox())!;
  await page.mouse.click(img.x + img.width / 2, img.y + 6);
  await joint.getByRole('button', { name: 'Done' }).click();
  await expect(dlg.getByRole('button', { name: /^Set the joint of upper_arm_L/ }).first()).toHaveText('Joint set');
  await dlg.getByRole('button', { name: 'Library hands: Use the drawn hands' }).click();
  await page.getByRole('option', { name: /^Library: / }).first().click();
  await expect(dlg.getByText('Rig check passed')).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Save character' }).click();
  await expect(dlg).toBeHidden();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const chr = Object.values(st.assets as Record<string, { kind: string; name: string; viewExemptions: Record<string, string> }>).find((a) => a.kind === 'chr' && a.name === 'hero')!;
  expect(Object.keys(chr.viewExemptions).sort()).toEqual(['back', 'side']);
  expect((chr as unknown as { data: { parts: { hands: string } } }).data.parts.hands).toMatch(/^base\./);
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  expect(st.scenes[sid].instances.some((i: { name: string }) => i.name === 'hero')).toBe(true);
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 0);
});

test('rigging assistant: a layered SVG becomes a prop with states and is placed (FR-IMP-03)', async ({ page }) => {
  await openProject(page, sample(false));
  const svg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-svg-')), 'lamp.svg');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><g id="stand"><rect x="90" y="100" width="20" height="300" fill="#3c3c3c"/></g><g id="state_on"><rect x="40" y="20" width="120" height="90" fill="#fadc5a"/></g><g id="state_off"><rect x="40" y="20" width="120" height="90" fill="#5a5a78"/></g></svg>');
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.locator('input[aria-label="Import a file"]').setInputFiles(svg);
  const imp = page.getByRole('dialog', { name: 'Import lamp.svg' });
  await imp.getByRole('radio', { name: /rigging assistant/ }).check();
  await imp.getByRole('button', { name: 'Open rigging assistant' }).click();
  const dlg = page.getByRole('dialog', { name: /Rigging assistant/ });
  // No head layer and state layers: the assistant opens as a prop.
  await expect(dlg.getByRole('button', { name: 'Prop with states' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(dlg.getByRole('button', { name: 'State for state_off' })).toContainText('Only when off');
  await expect(dlg.getByRole('img', { name: /lamp, (on|off)/ })).toHaveCount(2);
  await expect(dlg.getByText('Rig check passed')).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dlg.getByRole('button', { name: 'Save prop' }).click();
  await expect(dlg).toBeHidden();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const st = (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const prop = Object.values(st.assets as Record<string, { id: string; kind: string; name: string; parameters: { key: string; options: string[] }[] }>).find((a) => a.kind === 'prop' && a.name === 'lamp')!;
  expect(prop.parameters[0]!.options).toEqual(['on', 'off']);
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  expect(st.scenes[sid].instances.some((i: { asset?: string }) => i.asset === `${prop.id}@1`)).toBe(true);
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

test('a template starts a new scene with the chosen cast; Replace cast keeps its clips and the preview matches the export (FR-TPL-01/03)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const before = Object.keys((await state()).scenes).length;
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('searchbox', { name: /^Search/ }).or(page.getByRole('textbox', { name: /^Search/ })).first().fill('Comedy exchange');
  await page.getByRole('button', { name: /^Comedy exchange/ }).first().click();
  await page.getByRole('button', { name: 'New scene…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New scene from Comedy exchange' });
  await dialog.getByRole('button', { name: /^Customer: / }).click();
  await page.getByRole('option', { name: 'Maya Bennett' }).click();
  await dialog.getByRole('button', { name: 'Create scene' }).click();
  await expect.poll(async () => Object.keys((await state()).scenes).length).toBe(before + 1);
  let st = await state();
  const sid = Object.keys(st.scenes).find((k) => st.scenes[k].name === 'Comedy exchange')!;
  const chars = st.scenes[sid].instances.filter((i: { kind: string }) => i.kind === 'character');
  expect(chars.map((i: { asset: string }) => i.asset).sort()).toEqual(['chr.maya-bennett@1', 'chr.theo-lambert@1']);
  const clips = st.scenes[sid].clips.length;
  // The new scene is open; recast the barista from the Layers context menu.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: /Barista/ }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Replace cast…' }).click();
  const recast = page.getByRole('dialog', { name: 'Replace Barista' });
  await recast.getByRole('button', { name: /^Character: / }).click();
  await page.getByRole('option', { name: 'Leo Park' }).click();
  await recast.getByRole('button', { name: 'Replace' }).click();
  await expect.poll(async () => (await state()).scenes[sid].instances.find((i: { id: string }) => i.id === chars.find((c: { asset: string }) => c.asset === 'chr.theo-lambert@1').id).asset).toBe('chr.leo-park@1');
  st = await state();
  expect(st.scenes[sid].clips.length).toBe(clips);
  // Seek to 5 s (the barista's close-up) and compare with the export renderer.
  await page.locator('body').click({ position: { x: 5, y: 895 } });
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(800);
  await previewMatchesServer(page, 5 * 48000, sid);
});

test('timeline: box selection, moving several clips, ripple delete, marker rename and numeric timing (FR-TML-02/04/07)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const sfx = st.scenes[sid].tracks.find((t: { kind: string }) => t.kind === 'sfx').id;
  const add = async (a: number, b: number, name: string) => (await (await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'clip.add', params: { scene: sid, track: sfx, start: a * 48000, end: b * 48000, name, params: {} } }] } })).json()).commands[0].params.id as string;
  const a = await add(1, 2, 'Cue A');
  const b = await add(2, 3, 'Cue B');
  const c = await add(4, 5, 'Cue C');
  const at = async (id: string) => (await state()).scenes[sid].clips.find((x: { id: string }) => x.id === id);
  const tl = page.getByRole('region', { name: 'Timeline' });
  await expect(tl.getByRole('button', { name: /: Cue C$/ })).toBeVisible();
  await tl.getByRole('button', { name: 'Zoom to fit' }).click();
  // Box-select A and B by dragging across the empty part of their lane, from before A to inside B.
  await tl.getByRole('button', { name: /: Cue A$/ }).scrollIntoViewIfNeeded();
  const ba = (await tl.getByRole('button', { name: /: Cue A$/ }).boundingBox())!;
  const bb = (await tl.getByRole('button', { name: /: Cue B$/ }).boundingBox())!;
  await page.mouse.move(ba.x - 12, ba.y + ba.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + 2, { steps: 6 });
  await page.mouse.up();
  await expect(tl.getByRole('button', { name: /: Cue A$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(tl.getByRole('button', { name: /: Cue B$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(tl.getByRole('button', { name: /: Cue C$/ })).toHaveAttribute('aria-pressed', 'false');
  // Dragging one of them moves both.
  const b2 = (await tl.getByRole('button', { name: /: Cue B$/ }).boundingBox())!;
  const px = b2.width; // one second
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + px / 2, b2.y + b2.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => [(await at(a)).start, (await at(b)).start]).toEqual([1.5 * 48000, 2.5 * 48000]);
  // Ripple delete: C moves up by the removed length (2 s).
  await tl.getByRole('button', { name: 'Ripple' }).click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await at(c)).start).toBe(2 * 48000);
  expect(await at(a)).toBeUndefined();
  // Numeric timing in Properties: C starts at 6 s and lasts 0.5 s.
  await tl.getByRole('button', { name: /: Cue C$/ }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByRole('spinbutton', { name: 'Start' }).fill('6');
  await page.getByRole('spinbutton', { name: 'Start' }).press('Enter');
  await expect.poll(async () => (await at(c)).start).toBe(6 * 48000);
  await page.getByRole('spinbutton', { name: 'Length' }).fill('0.5');
  await page.getByRole('spinbutton', { name: 'Length' }).press('Enter');
  await expect.poll(async () => (await at(c)).end).toBe(6.5 * 48000);
  // Marker rename by double-click.
  await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'marker.add', params: { scene: sid, name: 'Marker 1', at: 3 * 48000 } }] } });
  page.once('dialog', (d) => void d.accept('Punchline'));
  await tl.getByRole('button', { name: 'Marker Marker 1' }).dblclick();
  await expect.poll(async () => (await state()).scenes[sid].markers[0].name).toBe('Punchline');
});

test('a new project starts from a template; the episode view reorders scenes and sets the transition into a scene (FR-PRJ-01, FR-TML-09, FR-FX-03)', async ({ page }) => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-new-')), 'Comedy.frame');
  await page.goto('/');
  const form = page.getByRole('region', { name: 'New project' }).or(page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) })).first();
  await form.getByRole('textbox', { name: 'Folder' }).fill(dir);
  await form.getByRole('textbox', { name: 'Name' }).fill('Coffee bits');
  await form.getByRole('button', { name: /^Start from: / }).click();
  await page.getByRole('option', { name: 'Comedy exchange' }).click();
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  expect(st.project.name).toBe('Coffee bits');
  const ep = st.episodes[st.project.episodes[0]];
  expect(ep.scenes.map((id: string) => st.scenes[id].name)).toEqual(['Comedy exchange']);
  // A second scene from another template, then the episode view.
  await page.request.post(`/api/projects/${pid}/templates/apply`, { data: { ref: 'tpl.news-segment@1' } });
  await expect.poll(async () => (await state()).episodes[ep.id].scenes.length).toBe(2);
  await page.getByRole('menuitem', { name: 'Scene' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Episode view' }).click();
  const view = page.getByRole('region', { name: 'Episode' });
  await expect(view.getByRole('button', { name: 'Open News segment' })).toBeVisible();
  // Transition into the news segment: crossfade from the comedy scene's last picture.
  await view.getByRole('button', { name: /^Into News segment: / }).click();
  await page.getByRole('option', { name: 'Crossfade' }).click();
  await expect.poll(async () => {
    const s2 = await state();
    const sc = s2.scenes[s2.episodes[ep.id].scenes[1]];
    const shot = sc.tracks.find((t: { kind: string }) => t.kind === 'shot').id;
    return sc.clips.find((c: { track: string; start: number }) => c.track === shot && c.start === 0)?.params.transition;
  }).toBe('tr.crossfade@1');
  // Reorder: the news segment first.
  await view.getByRole('button', { name: 'Move News segment earlier' }).click();
  await expect.poll(async () => { const s3 = await state(); return s3.episodes[ep.id].scenes.map((id: string) => s3.scenes[id].name); }).toEqual(['News segment', 'Comedy exchange']);
  st = await state();
  await new AxeBuilder({ page }).include('[aria-label="Episode"]').analyze().then((r) => expect(r.violations.map((v) => v.id)).toEqual([]));
});

test('the script view imports a script, edits a line in place and exports Fountain (FR-PRJ-04, FR-DLG-02)', async ({ page }) => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-script-')), 'Script.frame');
  await page.goto('/');
  const form = page.getByRole('region', { name: 'New project' }).or(page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) })).first();
  await form.getByRole('textbox', { name: 'Folder' }).fill(dir);
  await form.getByRole('textbox', { name: 'Name' }).fill('Script test');
  await form.getByRole('button', { name: /^Start from: / }).click();
  await page.getByRole('option', { name: 'Comedy exchange' }).click();
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const names = st.scenes[sid].instances.filter((i: { kind: string }) => i.kind === 'character').map((i: { name: string }) => i.name as string);
  const lineCount = async () => (await state()).scenes[sid].clips.filter((c: { line?: unknown }) => c.line).length;
  const before = await lineCount();
  await page.getByRole('menuitem', { name: 'Scene' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Script view' }).click();
  const view = page.getByRole('region', { name: 'Script' });
  await view.getByRole('button', { name: 'Import script…' }).click();
  await page.getByRole('textbox', { name: 'Script' }).fill(`${names[0]}: Did you order the usual?\n${names[1]} (happy): Always.\nNobody: Hello?`);
  await page.getByRole('button', { name: 'Add lines' }).click();
  await expect(page.getByText(/No character in the scene is called Nobody/)).toBeVisible();
  await expect.poll(lineCount).toBe(before + 2);
  const field = view.getByRole('textbox', { name: `${names[0]}: line text` }).last();
  await expect(field).toHaveValue('Did you order the usual?');
  await field.fill('Did you order the usual, again?');
  await field.press('Enter');
  await expect.poll(async () => (await state()).scenes[sid].clips.some((c: { line?: { text: string } }) => c.line?.text === 'Did you order the usual, again?')).toBe(true);
  const fountain = await (await page.request.get(`/api/projects/${pid}/script?format=fountain`)).text();
  expect(fountain).toContain(`${names[1]!.toUpperCase()}\n(happy)\nAlways.`);
  await new AxeBuilder({ page }).include('[aria-label="Script"]').analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
});

test('project settings, rich-text notes and the script PDF (FR-PRJ-04, FR-PRJ-05)', async ({ page }) => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-settings-')), 'Settings.frame');
  await page.goto('/');
  const form = page.getByRole('region', { name: 'New project' }).or(page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) })).first();
  await form.getByRole('textbox', { name: 'Folder' }).fill(dir);
  await form.getByRole('textbox', { name: 'Name' }).fill('Settings test');
  await form.getByRole('button', { name: /^Start from: / }).click();
  await page.getByRole('option', { name: 'Comedy exchange' }).click();
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Project settings…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Project settings' });
  await dlg.getByRole('textbox', { name: 'Project name' }).fill('Renamed show');
  await dlg.getByRole('textbox', { name: 'Description' }).click();
  await expect.poll(async () => (await state()).project.name).toBe('Renamed show');
  await dlg.getByRole('textbox', { name: 'Description' }).fill('A show about ');
  await dlg.getByRole('textbox', { name: 'Description' }).press('End');
  await dlg.getByRole('button', { name: 'Bold' }).click();
  await dlg.getByRole('button', { name: 'Preview notes' }).click();
  await expect(dlg.locator('.st-notes-view strong')).toHaveText('text');
  await expect.poll(async () => (await state()).project.description).toBe('A show about **text**');
  await dlg.getByRole('button', { name: /^Frame rate: / }).click();
  await page.getByRole('option', { name: '25 fps' }).click();
  await expect.poll(async () => (await state()).project.frameRate).toBe(25);
  const before = (await state()).project.captions.speakerLabels;
  await dlg.getByRole('checkbox', { name: 'Speaker labels' }).click();
  await expect.poll(async () => (await state()).project.captions.speakerLabels).toBe(!before);
  await new AxeBuilder({ page }).include('[role="dialog"]').analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
  await dlg.getByRole('button', { name: 'Done' }).click();
  // Scene notes are one undo step per edit session.
  await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  await page.getByRole('textbox', { name: 'Scene notes' }).fill('## Beat\n- setup\n- *payoff*');
  await page.getByRole('textbox', { name: 'Scene notes' }).blur();
  await expect(page.getByRole('button', { name: /^Undo Edit scene notes/ }).first()).toBeVisible();
  const pdf = await page.request.get(`/api/projects/${pid}/script?format=pdf`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
});

test('the project browser pins, searches, duplicates and moves a project to the trash (FR-PRJ-06, FR-PRJ-07)', async ({ page }) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-browser-'));
  const dir = path.join(base, 'Browse.frame');
  await page.goto('/');
  const form = page.getByRole('region', { name: 'New project' }).or(page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) })).first();
  await form.getByRole('textbox', { name: 'Folder' }).fill(dir);
  await form.getByRole('textbox', { name: 'Name' }).fill('Browser show');
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  await page.goto('/#/');
  const browser = page.getByRole('region', { name: 'Projects' }).or(page.getByRole('complementary', { name: 'Projects' })).first();
  await expect(browser.getByRole('button', { name: 'Open Browser show' })).toBeVisible();
  await expect(browser.getByText(/1 episode · 1 scene/).first()).toBeVisible();
  // Pin, then search.
  await browser.getByRole('button', { name: 'Pin Browser show' }).click();
  await expect(browser.getByRole('list', { name: 'Pinned projects' }).getByRole('button', { name: 'Open Browser show' })).toBeVisible();
  await browser.getByRole('textbox', { name: 'Search projects' }).fill('zzz-nothing');
  await expect(browser.getByText('No matches')).toBeVisible();
  await browser.getByRole('textbox', { name: 'Search projects' }).fill('browser sh');
  // Duplicate under a new id.
  await browser.getByRole('button', { name: 'Browser show actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Duplicate…' }).click();
  const copyDir = path.join(base, 'Browse copy.frame');
  await page.getByRole('textbox', { name: 'New folder' }).fill(copyDir);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(browser.getByRole('button', { name: 'Open Browser show copy' })).toBeVisible();
  const ids = await Promise.all([dir, copyDir].map((d) => JSON.parse(fs.readFileSync(path.join(d, 'project.json'), 'utf8')).id as string));
  expect(ids[0]).not.toBe(ids[1]);
  // Delete the copy: it moves to the trash, never a permanent delete.
  await browser.getByRole('button', { name: 'Browser show copy actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete (move to trash)…' }).click();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(browser.getByRole('button', { name: 'Open Browser show copy' })).toHaveCount(0);
  expect(fs.existsSync(copyDir)).toBe(false);
  // An invalid folder shows a validation report (FR-PRJ-07).
  const bad = path.join(base, 'Broken.frame');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'project.json'), '{ not json');
  await page.getByRole('textbox', { name: 'Project folder' }).fill(bad);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Validation report' })).toContainText('INVALID_JSON');
  await new AxeBuilder({ page }).analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
});

test('copy and paste an object within a scene and into another scene (FR-PER-07)', async ({ page }) => {
  const dir = sample(false);
  await openProject(page, dir);
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  const ep = st.project.episodes[0];
  const sid = st.episodes[ep].scenes[0];
  await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(async () => (await state()).scenes[sid].instances.filter((i: { name: string }) => i.name === 'Maya Bennett copy').length).toBe(1);
  // Another scene: the copy keeps its name.
  await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'scene.add', params: { episode: ep, name: 'Pasted here' } }] } });
  st = await state();
  const other = st.episodes[ep].scenes.find((s: string) => st.scenes[s].name === 'Pasted here');
  await page.getByRole('menuitem', { name: 'Scene' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Go to Pasted here' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /^Paste/ }).click();
  await expect.poll(async () => (await state()).scenes[other].instances.map((i: { name: string }) => i.name)).toEqual(['Maya Bennett']);
  await expect(page.getByRole('button', { name: /^Undo Paste/ }).first()).toBeVisible();
});

test('first run sets the theme, checks the worker and picks a template; the tour walks the workspace (FR-ONB-01)', async ({ page }) => {
  await page.goto('/');
  const dlg = page.getByRole('dialog', { name: 'Welcome to Frame' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await dlg.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('dialog', { name: 'Voice worker' }).getByText(/Connected|Offline|Not set up/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('dialog', { name: 'Start a project' }).getByRole('button', { name: 'Comedy exchange' }).click();
  await expect(page.getByRole('button', { name: 'Start from: Comedy exchange' })).toBeVisible();
  // The tour runs once, on the first workspace.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-e2e-onb-')), 'Tour.frame');
  await page.getByRole('textbox', { name: 'Folder', exact: true }).fill(dir);
  await page.getByRole('button', { name: 'Create project' }).click();
  const tour = page.getByRole('dialog', { name: 'Stage, Direct and Edit' });
  await expect(tour).toBeVisible();
  for (let i = 0; i < 7; i++) await page.locator('.st-tour-card').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Find anything' })).toBeVisible();
  await page.locator('.st-tour-card').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.st-tour-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Direct' })).toBeVisible();
  await expect(page.locator('.st-tour-card')).toHaveCount(0);
});

test('command palette, settings and help (FR-ONB-02, FR-ONB-03, FR-SET-01)', async ({ page }) => {
  const dir = sample(false);
  await openProject(page, dir);
  // Palette: a scene, a layer and a command.
  await page.keyboard.press('ControlOrMeta+k');
  const pal = page.getByRole('dialog', { name: 'Command palette' });
  await pal.getByRole('combobox').fill('type:layer maya');
  await expect(pal.getByRole('option', { name: /Layers.*Maya Bennett/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('Maya Bennett');
  await page.keyboard.press('ControlOrMeta+k');
  await pal.getByRole('combobox').fill('script view');
  await new AxeBuilder({ page }).include('[role="dialog"]').analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
  await pal.getByRole('option', { name: /Commands.*Script view/ }).click();
  await expect(page.getByRole('region', { name: 'Script' })).toBeVisible();
  // Help from a panel's help link.
  await page.getByRole('button', { name: 'Help: Layers' }).click();
  await expect(page.getByRole('navigation', { name: 'Help topics' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Layers' })).toContainText('The Layers tree');
  await new AxeBuilder({ page }).analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
  // Settings: density, a rebound shortcut, autosave.
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Compact' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('button', { name: 'Change shortcut for Command palette' }).click();
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(page.getByRole('complementary', { name: 'Keyboard shortcuts' })).toContainText(/(Ctrl|⌘) Shift P/);
  await page.getByRole('spinbutton', { name: 'Autosave delay' }).fill('1500');
  await page.getByRole('spinbutton', { name: 'Autosave delay' }).press('Enter');
  await expect.poll(async () => (await (await page.request.get('/api/settings')).json()).effective.autosaveMs).toBe(1500);
  await new AxeBuilder({ page }).analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.request.post('/api/settings', { data: { autosaveMs: 400 } });
});

test('a ready-made set, kit palette and time of day; a costume change and an accessory taken off (FR-ENV-01/02, FR-WRD-03/04)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  let st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const search = page.getByRole('searchbox', { name: /^Search/ }).or(page.getByRole('textbox', { name: /^Search/ })).first();
  await search.fill('Sofa chat');
  await page.getByRole('button', { name: /^Sofa chat/ }).first().click();
  await page.getByRole('button', { name: 'Add to scene' }).click();
  await expect.poll(async () => (await state()).scenes[sid].stage.marks.map((m: { name: string }) => m.name)).toEqual(expect.arrayContaining(['Sofa left', 'Sofa right']));
  // Palette and time of day from a kit piece's properties.
  st = await state();
  const sofa = st.scenes[sid].instances.find((i: { params: { part?: string } }) => i.params.part === 'sofa');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: new RegExp(sofa.name) }).first().click();
  await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  await page.getByRole('group', { name: 'Kit palette' }).getByRole('button', { name: /Pastel/ }).click();
  await page.getByRole('group', { name: 'Time of day' }).getByRole('button', { name: 'Night' }).click();
  await expect.poll(async () => (await state()).scenes[sid].clips.some((c: { asset?: string }) => c.asset === 'atmo.night@1')).toBe(true);
  st = await state();
  expect(st.scenes[sid].instances.filter((i: { asset?: string }) => i.asset === sofa.asset).every((i: { params: { palette?: string; timeOfDay?: string } }) => i.params.palette === 'pastel' && i.params.timeOfDay === 'night')).toBe(true);
  // Wardrobe: change Maya's look at the playhead.
  await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
  await page.getByRole('tab', { name: 'Acting' }).click();
  const wardrobe = page.getByRole('button', { name: /^Wardrobe/ });
  if ((await wardrobe.getAttribute('aria-expanded')) === 'false') await wardrobe.click();
  await page.getByRole('button', { name: /^Change look to/ }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Change look', exact: true }).click();
  await expect.poll(async () => (await state()).scenes[sid].clips.some((c: { params: { look?: string } }) => typeof c.params.look === 'string')).toBe(true);
  await new AxeBuilder({ page }).include('aside[aria-label="Properties"]').analyze().then((r) => expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]));
});

test('the camera frame is dragged on the whole stage; aspect ratios preview with safe areas (FR-CAM-01, FR-CAM-06)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  await page.getByRole('button', { name: 'Show the camera frame on the whole stage' }).click();
  const frame = page.getByRole('img', { name: /^Camera frame/ });
  await expect(frame).toBeVisible();
  const camName = (await frame.getAttribute('aria-label'))!.replace(/^Camera frame (.*) \(.*$/, '$1');
  const cam0 = st.scenes[sid].cameras.find((c: { name: string }) => c.name === camName);
  const b = (await frame.boundingBox())!;
  // Drag the left border 40 px to the right: the camera moves right.
  await page.mouse.move(b.x + 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 22, b.y + b.height / 2, { steps: 4 });
  await page.mouse.move(b.x + 42, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).scenes[sid].cameras.find((c: { id: string }) => c.id === cam0.id).center.x).toBeGreaterThan(cam0.center.x + 20);
  // Corner resize makes the frame wider.
  const b2 = (await frame.boundingBox())!;
  await page.mouse.move(b2.x + b2.width - 1, b2.y + b2.height - 1);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width + 30, b2.y + b2.height + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).scenes[sid].cameras.find((c: { id: string }) => c.id === cam0.id).width).toBeGreaterThan(cam0.width);
  await page.getByRole('button', { name: 'Back to the camera view' }).click();
  // Another ratio previews with its safe areas.
  await page.getByRole('radio', { name: '9:16' }).click();
  await page.getByRole('button', { name: 'Show safe areas' }).click();
  await expect(page.locator('.st-safe-ui')).toBeVisible();
  const c = (await page.getByTestId('stage-canvas').boundingBox())!;
  expect(c.height).toBeGreaterThan(c.width);
});

test.describe(() => {
  // The config's fake microphone (Chromium's test beeps) exercises the recorder without a real device. Not speech.
  test.use({ permissions: ['microphone'] });
  test('records a take and clones a voice with consent; the voice library lists it with its consent and users (FR-VOI-01/04/05)', async ({ page }) => {
    await openProject(page, sample(false));
    await page.getByRole('treeitem', { name: /Maya Bennett/ }).first().click();
    await page.getByRole('tab', { name: 'Audio' }).click();
    // Record a take for the current line.
    await page.getByRole('button', { name: 'Record take…' }).click();
    const rec = page.getByRole('dialog', { name: /^Record a take/ });
    await rec.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(rec.getByText(/^Recording 1$/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    await rec.getByRole('button', { name: 'Stop' }).click();
    await rec.getByRole('button', { name: 'Use as a take' }).click();
    await expect(rec).toBeHidden();
    await expect(page.getByRole('list', { name: 'Takes' })).toContainText('Chosen', { timeout: 30_000 });
    // Clone: blocked until the consent section is complete.
    await page.getByRole('button', { name: 'Clone a voice…' }).click();
    const dlg = page.getByRole('dialog', { name: 'Clone a voice' });
    await dlg.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(dlg.getByText(/^Recording 1$/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(5000);
    await dlg.getByRole('button', { name: 'Stop' }).click();
    await dlg.getByRole('button', { name: 'Use this recording' }).click();
    await expect(dlg.getByText(/Using Recording 1/)).toBeVisible();
    await dlg.getByLabel('What is said in the recording').fill('Test tones from the fake microphone.');
    await expect(dlg.getByRole('button', { name: 'Clone voice' })).toBeDisabled();
    await dlg.getByRole('radio', { name: 'This is my own voice' }).check();
    await dlg.getByRole('textbox', { name: "Speaker's name" }).fill('Test Speaker');
    await dlg.getByRole('checkbox', { name: 'I confirm the statement above' }).check();
    await dlg.getByRole('button', { name: 'Clone voice' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText("Maya Bennett's voice", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // The voice library.
    const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
    await page.goto(`/#/p/${encodeURIComponent(pid)}/voices`);
    const list = page.getByRole('list', { name: 'Voices' });
    await list.getByRole('button', { name: /Maya Bennett's voice/ }).click();
    const details = page.getByRole('complementary', { name: 'Voice details' });
    await expect(details.getByText('Cloned')).toBeVisible();
    await expect(details.getByText(/Consent: own voice of Test Speaker/)).toBeVisible();
    await expect(details.getByText(/Maya Bennett · /)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test('a prop state change lands in the Props group; pinch zoom zooms the timeline (FR-TML-01, FR-TML-08, FR-PRP-01)', async ({ page }) => {
  await openProject(page, sample(false));
  const pid = decodeURIComponent(page.url().split('#/p/')[1]!.split('/')[0]!);
  const state = async () => (await (await page.request.get(`/api/projects/${pid}/state`)).json()).state;
  const st = await state();
  const sid = st.episodes[st.project.episodes[0]].scenes[0];
  const add = await page.request.post(`/api/projects/${pid}/commands`, { data: { commands: [{ name: 'instance.add', params: { scene: sid, kind: 'prop', asset: 'prop.door@1', name: 'Side door', transform: { x: 1600, y: 1000 }, depthPlane: 'back' } }] } });
  expect(add.ok()).toBe(true);
  await page.getByRole('treeitem', { name: /Side door/ }).first().click();
  await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  await page.getByRole('button', { name: 'Change to: Choose a state' }).click();
  await page.getByRole('option', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Add at playhead' }).click();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await expect(timeline.getByRole('button', { name: /^Props/ })).toBeVisible();
  await expect.poll(async () => (await state()).scenes[sid].clips.some((c: { params: { state?: string } }) => c.params.state === 'open')).toBe(true);
  // Trackpad pinch (ctrl + wheel) over the lanes zooms in.
  const zoom = timeline.getByRole('slider', { name: 'Zoom' });
  const val = async () => Number(await zoom.inputValue());
  const before = await val();
  expect(before).toBeGreaterThan(0);
  const box = (await timeline.locator('.st-tl-body').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect.poll(val).toBeGreaterThan(before);
});
