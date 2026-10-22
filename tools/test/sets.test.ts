import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectState, evaluateFrame, kitLookCommands, ProjectSession, sequentialIds, setCommands, setFromScene, shiftColor, validateProject, type ProjectState, type SetData, type TimeOfDay } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const presets = (JSON.parse(fs.readFileSync(path.join(content, 'library.json'), 'utf8')) as { defaults: { timeOfDay: TimeOfDay[] } }).defaults.timeOfDay;
type Kit = Parameters<typeof kitLookCommands>[3] & Parameters<typeof setCommands>[3];
const kitOf = (ref: string) => (lib.manifest(ref)?.data as { kit: Kit }).kit;

function project() {
  const ids = sequentialIds(700);
  const state: ProjectState = createProjectState(ids, { name: 'Sets', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: '0', now: '2026-10-22T00:00:00Z', seed: 2 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  return { session, ids, scene: state.episodes[state.project.episodes[0]!]!.scenes[0]! };
}
const place = (session: ProjectSession, ids: ReturnType<typeof sequentialIds>, scene: string, set: SetData) => {
  const kit = kitOf(set.kit);
  session.apply({ commands: setCommands(session.state, scene, set, kit, { newId: ids }).commands });
  const tod = presets.find((t) => t.id === set.timeOfDay);
  if (set.palette || tod) session.apply({ commands: kitLookCommands(session.state, scene, set.kit, kit, { ...(set.palette ? { palette: set.palette } : {}), ...(tod ? { timeOfDay: tod } : {}), presets }) });
};

describe('sets, kit palettes and time of day (FR-ENV-01, FR-ENV-02)', () => {
  it('every kit has palettes over all its colour slots; a palette recolours shared slots the same way on every piece', () => {
    const kits = lib.search('', { kind: 'kit', limit: 100 }).map((h) => h.ref);
    expect(kits.length).toBeGreaterThanOrEqual(16);
    for (const ref of kits) {
      const k = kitOf(ref) as Kit & { palettes: { id: string; colors: Record<string, string> }[] };
      expect(k.palettes.map((p) => p.id), ref).toEqual(['original', 'warm', 'cool', 'muted', 'pastel', 'bold']);
      const slots = new Set(Object.values(k.parts).flatMap((p) => Object.keys((p as { art: { colors?: Record<string, string> } }).art.colors ?? {})));
      for (const p of k.palettes) expect(Object.keys(p.colors).sort(), `${ref} ${p.id}`).toEqual([...slots].sort());
    }
    const { session, ids, scene } = project();
    place(session, ids, scene, { kit: 'kit.living-room@1', props: [], marks: [], cameras: [] });
    session.apply({ commands: kitLookCommands(session.state, scene, 'kit.living-room@1', kitOf('kit.living-room@1'), { palette: 'cool', presets }) });
    const pieces = session.state.scenes[scene]!.instances.filter((i) => i.asset === 'kit.living-room@1');
    const byslot = new Map<string, Set<string>>();
    for (const i of pieces) for (const [k, v] of Object.entries(i.params.colors as Record<string, string>)) byslot.set(k, (byslot.get(k) ?? new Set()).add(v));
    for (const [k, vs] of byslot) expect(vs.size, k).toBe(1);
    expect(pieces.every((i) => i.params.palette === 'cool')).toBe(true);
  });

  it('time of day shifts the palette and sets one lighting atmosphere, replacing the previous one', () => {
    const { session, ids, scene } = project();
    place(session, ids, scene, { kit: 'kit.kitchen@1', props: [], marks: [], cameras: [] });
    const kit = kitOf('kit.kitchen@1');
    const night = presets.find((t) => t.id === 'night')!;
    session.apply({ commands: kitLookCommands(session.state, scene, 'kit.kitchen@1', kit, { palette: 'warm', timeOfDay: night, presets }) });
    session.apply({ commands: kitLookCommands(session.state, scene, 'kit.kitchen@1', kit, { timeOfDay: presets.find((t) => t.id === 'dusk')!, presets }) });
    const sc = session.state.scenes[scene]!;
    const atmos = sc.clips.filter((c) => presets.some((t) => t.atmosphere === c.asset)).map((c) => c.asset);
    expect(atmos).toEqual(['atmo.dusk@1']);
    // The palette chosen before is kept under the new time of day.
    const wall = sc.instances.find((i) => i.params.part === 'wall')!;
    const warm = (kit as unknown as { palettes: { id: string; colors: Record<string, string> }[] }).palettes.find((p) => p.id === 'warm')!.colors;
    expect(wall.params.palette).toBe('warm');
    expect((wall.params.colors as Record<string, string>).wall).toBe(shiftColor(warm.wall!, presets.find((t) => t.id === 'dusk')!));
  });

  it('all 32 ready-made sets place cleanly, validate and render; a scene saves back as an equivalent set', () => {
    const sets = lib.search('', { kind: 'set', limit: 100 }).map((h) => h.ref);
    expect(sets).toHaveLength(32);
    for (const ref of sets) {
      const set = (lib.manifest(ref)!.data as { set: SetData }).set;
      const { session, ids, scene } = project();
      place(session, ids, scene, set);
      const problems = validateProject(session.state, { assetExists: (r) => lib.has(r), manifest: (r) => lib.manifest(r) }).filter((p) => p.blocksExport);
      expect(problems.map((p) => p.message), ref).toEqual([]);
      const sc = session.state.scenes[scene]!;
      expect(sc.stage.marks.length, ref).toBe(set.marks.length);
      expect(sc.cameras.length, ref).toBe(set.cameras.length + 1);
      const ev = evaluateFrame(session.state, scene, 0, { assets: { manifest: (r) => lib.manifest(r) }, styles, width: 480, height: 270 });
      expect(ev.issues, ref).toEqual([]);
      const back = setFromScene(session.state, scene);
      expect(back.kit).toBe(set.kit);
      expect(back.props.map((p) => p.ref)).toEqual(set.props.map((p) => p.ref));
      expect(back.marks.map((m) => m.name)).toEqual(set.marks.map((m) => m.name));
      if (set.palette) expect(back.palette).toBe(set.palette);
    }
  });
});
