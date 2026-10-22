import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectState, evaluateFrame, ProjectSession, secondsToTicks, sequentialIds, trackFor, validateProject, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import type { Command } from '@frame/schema';
import type { Item } from '@frame/render';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;
const quiet = { idle: false, listening: false, blinks: false, talkingGestures: false };

function project() {
  const ids = sequentialIds(900);
  const state: ProjectState = createProjectState(ids, { name: 'Wardrobe', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: '0', now: '2026-10-22T00:00:00Z', seed: 1 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const apply = (commands: Command[]) => session.apply({ commands });
  const who = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.marcus-hale@1', name: 'Marcus', transform: { x: 960, y: 1000 }, character: { look: 'anchor', view: 'front', posture: 'standing', auto: quiet } } }]).commands[0]!.params.id as string;
  return { session, scene, apply, who, acting: trackFor(session.state.scenes[scene]!, who, 'acting')!.id };
}

/** Group ids drawn under a root item, with the group's opacity. */
function groups(items: Item[], out: { id: string; op: number }[] = [], op = 1): { id: string; op: number }[] {
  for (const it of items) if (it.k === 'group') {
    const o = op * (it.op ?? 1);
    if (it.id) out.push({ id: it.id, op: o });
    groups(it.items, out, o);
  }
  return out;
}
const frame = (st: ProjectState, scene: string, t: number) => evaluateFrame(st, scene, s(t), { assets, styles, width: 960, height: 540 });

describe('wardrobe (FR-WRD-03, FR-WRD-04)', () => {
  it('a look clip changes costume at a time with a dissolve; the instance look holds before it', () => {
    const { session, scene, apply, acting } = project();
    apply([{ name: 'clip.add', params: { scene, track: acting, start: s(2), end: s(3), params: { look: 'off-air', transitionS: 0.5 } } }]);
    expect(validateProject(session.state, { assetExists: (r) => lib.has(r), manifest: (r) => lib.manifest(r) }).filter((p) => p.blocksExport)).toEqual([]);
    const ids = (t: number) => groups(frame(session.state, scene, t).frame.items);
    // Before: the anchor look wears a tie.
    expect(ids(1).some((g) => g.id.startsWith('acc.tie'))).toBe(true);
    // Halfway through the dissolve both looks draw at half strength.
    const mid = ids(2.25).filter((g) => g.id.startsWith('acc.tie'));
    expect(mid.length).toBeGreaterThan(0);
    expect(mid[0]!.op).toBeCloseTo(0.5, 1);
    // After: the off-air look has no tie, and the change persists past the clip's end.
    expect(ids(2.6).some((g) => g.id.startsWith('acc.tie'))).toBe(false);
    expect(ids(5).some((g) => g.id.startsWith('acc.tie'))).toBe(false);
  });

  it('an accessory can be taken off into a hand, held, and put away', () => {
    const { session, scene, apply, acting } = project();
    apply([
      { name: 'clip.add', params: { scene, track: acting, start: s(1), end: s(2.8), asset: 'act.wave-hello@1', params: { accessoryOp: 'remove', accessory: 'acc.tie', accessoryAt: 0.3 } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(4), end: s(5), asset: 'act.shrug@1', params: { accessoryOp: 'stow', accessory: 'acc.tie' } } },
    ]);
    const box = (t: number) => {
      const r = frame(session.state, scene, t);
      return { tie: groups(r.frame.items).filter((g) => g.id.startsWith('acc.tie')).length };
    };
    const worn = frame(session.state, scene, 0.5);
    const held = frame(session.state, scene, 3.5);
    expect(box(0.5).tie).toBeGreaterThan(0);
    expect(box(3.5).tie).toBeGreaterThan(0);
    // Held: drawn somewhere else (in the hand), so the picture differs from the worn frame.
    expect(JSON.stringify(held.frame.items)).not.toBe(JSON.stringify(worn.frame.items));
    // Put away: not drawn at all.
    expect(box(5.5).tie).toBe(0);
  });

  it('patterns tile over patternable garments, clipped to them; options change garments per look (FR-WRD-02)', async () => {
    const { resolveCharacter } = await import('@frame/core');
    const { composeCharacter, NEUTRAL_FACE, REST_POSE } = await import('@frame/rig');
    const pose = { view: 'front' as const, flip: false, pose: JSON.parse(JSON.stringify(REST_POSE)), face: { ...NEUTRAL_FACE }, mouth: null, gaze: [0, 0] as [number, number], overlays: {} };
    const draw = (edit: (look: Record<string, unknown>) => void) => {
      const m = JSON.parse(JSON.stringify(lib.manifest('chr.maya-bennett@1')));
      edit(m.data.looks[1]);
      const { spec } = resolveCharacter(m, m.data.looks[1].id, 'flat', styles.flat, assets);
      return composeCharacter(spec, pose).item;
    };
    const clipped = (it: Item): number => (it.k === 'group' ? (it.clip ? 1 : 0) + it.items.reduce((n, x) => n + clipped(x), 0) : 0);
    const plain = draw(() => undefined);
    const checked = draw((l) => { l.patterns = { top: { pattern: 'pattern.checks@1', scale: 1.5, rotation: 45, colors: ['#112233'] } }; });
    expect(clipped(checked)).toBeGreaterThan(clipped(plain));
    expect(JSON.stringify(checked)).toContain('#112233');
    // Every bundled pattern renders and its tile is non-empty (except solid and the custom print, which takes an image).
    for (const id of ['stripes', 'pinstripe', 'checks', 'plaid', 'houndstooth', 'polka-dots', 'floral', 'camouflage', 'denim-texture', 'knit-texture', 'leopard', 'paisley']) {
      const p = (lib.manifest(`pattern.${id}@1`)?.data as { pattern: { layers: unknown[] } }).pattern;
      expect(p.layers.length, id).toBeGreaterThan(0);
      expect(clipped(draw((l) => { l.patterns = { bottom: { pattern: `pattern.${id}@1` } }; }))).toBeGreaterThan(clipped(plain));
    }
    // Per-garment options: a hoodie with the hood up draws differently from hood down.
    const hoodie = (hood: string) => JSON.stringify(draw((l) => { l.garments = ['top.hoodie@1']; l.options = { 'top.hoodie@1': { hood } }; }));
    expect(hoodie('up')).not.toBe(hoodie('down'));
  });
});
