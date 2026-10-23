/**
 * Asset previews (FR-AST-07, CAT-04): a throwaway project in which a library item is shown on the library's preview
 * character (parts swapped in through a project-local copy, expressions and actions as clips), framed for a
 * thumbnail. Uses the same commands and evaluation as real scenes, so previews look exactly like the item in use.
 */
import { setCommands, type SetData } from './sets.js';
import type { AssetManifest } from '@frame/schema';
import { createProjectState } from './defaults.js';
import { sequentialIds } from './ids.js';
import { ProjectSession } from './session.js';
import type { ProjectState } from './state.js';
import { trackFor } from './lookup.js';
import { evaluateFrame, type EvalOptions } from './perform/evaluate.js';
import type { CharacterData } from './perform/character.js';

/** Character-part kinds and the `parts` key they replace on the preview character. */
const PART_KEYS: Record<string, string> = { head: 'head', eyes: 'eyes', brow: 'brows', nose: 'nose', mouth: 'mouth', ears: 'ears', hair: 'hair', fringe: 'fringe', 'facial-hair': 'facialHair', feet: 'feet' };
const GARMENT_KINDS = new Set(['top', 'outer', 'bottom', 'dress', 'shoe', 'acc']);
const FACE_FRAMED = new Set(['head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'exp', 'skin', 'makeup', 'skin-detail', 'eyestate', 'browstate', 'mouthshape', 'face-ctl', 'eye-ctl', 'hair-ctl', 'overlay']);

export interface PreviewSetup {
  state: ProjectState;
  scene: string;
  t: number;
  framing: 'full' | 'face' | 'upper' | 'scene';
  /** Instance to frame (character or prop). */
  subject?: string;
}

/** The preset colour farthest from `from` (RGB distance), so a colour control's preview reads at thumbnail size. */
function mostDifferent(presets: string[], from: string): string | undefined {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const a = rgb(from);
  let best: string | undefined;
  let d = -1;
  for (const p of presets) {
    const b = rgb(p);
    const dist = (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
    if (dist > d) [best, d] = [p, dist];
  }
  return best;
}

/** Kinds that have a visual preview; others (output presets, controls without art) return undefined. */
export function previewable(kind: string): boolean {
  return kind === 'chr' || kind in PART_KEYS || GARMENT_KINDS.has(kind) || kind === 'skin' || kind === 'body' || kind === 'skin-detail' || kind === 'makeup' || kind === 'identity' || kind === 'exp' || kind === 'act' || kind === 'mouthshape' || kind === 'overlay' || kind === 'eyestate' || kind === 'browstate' || kind === 'face-ctl' || kind === 'eye-ctl' || kind === 'hair-ctl' || kind === 'prop' || kind === 'kit' || kind === 'txt' || kind === 'pattern' || kind === 'set';
}

const PREVIEW_USER_ID = 'user.00000000-0000-4000-8000-0000000000ff';

/** Builds the preview project for `ref`. `previewCharacter` comes from the library defaults (content), never code. */
export function previewSetup(ref: string, m: AssetManifest, previewCharacter: { ref: string; manifest: AssetManifest; /** Long hairstyle for hair-control previews (library defaults). */ hair?: string } | undefined, lookup?: (ref: string) => AssetManifest | undefined): PreviewSetup | undefined {
  if (!previewable(m.kind)) return undefined;
  const ids = sequentialIds(1);
  const state = createProjectState(ids, { name: 'Preview', styleFamily: 'flat', frameRate: 24, output: { preset: 'preview', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: 'preview', now: '2000-01-01T00:00:00Z', seed: 1 });
  const s = new ProjectSession(state, 0, { newId: ids, now: () => '2000-01-01T00:00:00Z' });
  const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const apply = (commands: { name: string; params: Record<string, unknown> }[]) => s.apply({ commands });
  const addCharacter = (asset: string, look: string, view = 'three') =>
    apply([{ name: 'instance.add', params: { scene, kind: 'character', asset, name: 'Preview', transform: { x: 960, y: 1000 }, character: { look, view, posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } }]).commands[0]!.params.id as string;

  if (m.kind === 'prop') {
    const id = apply([{ name: 'instance.add', params: { scene, kind: 'prop', asset: ref, name: m.name, transform: { x: 960, y: 800 } } }]).commands[0]!.params.id as string;
    return { state: s.state, scene, t: 0, framing: 'full', subject: id };
  }
  if (m.kind === 'kit') {
    const parts = (m.data as { kit?: { parts: Record<string, { plane?: string; at?: [number, number]; order?: number }> } }).kit?.parts ?? {};
    // Parts keep the kit's declared order within their plane (manifest keys are sorted, not drawn in order).
    apply(Object.entries(parts).map(([part, p]) => ({ name: 'instance.add', params: { scene, kind: 'set-piece', asset: ref, name: part, transform: { x: p.at?.[0] ?? 960, y: p.at?.[1] ?? 1080 }, depthPlane: p.plane ?? 'back', ...(p.order !== undefined ? { order: p.order } : {}), params: { part } } })));
    return { state: s.state, scene, t: 0, framing: 'scene' };
  }
  if (m.kind === 'set') {
    // A ready-made set (FR-ENV-01): its kit pieces and props in place.
    const set = (m.data as { set?: SetData }).set;
    const kit = set && (lookup?.(set.kit)?.data as { kit?: Parameters<typeof setCommands>[3] } | undefined)?.kit;
    if (!set || !kit) return undefined;
    apply(setCommands(s.state, scene, { ...set, cameras: [], marks: [] }, kit, { newId: ids }).commands);
    return { state: s.state, scene, t: 0, framing: 'scene' };
  }
  if (m.kind === 'chr') {
    const subject = addCharacter(ref, (m.data as CharacterData).defaultLook);
    return { state: s.state, scene, t: 0, framing: 'full', subject };
  }
  if (!previewCharacter) return undefined;
  const base = previewCharacter.manifest.data as CharacterData;
  let charRef = previewCharacter.ref;
  const control = (m.data as { control?: { type: string; target?: string; default?: number | string; range?: [number, number]; options?: string[]; presets?: string[] } }).control;
  if (m.kind in PART_KEYS || GARMENT_KINDS.has(m.kind) || m.kind === 'skin' || m.kind === 'body' || m.kind === 'skin-detail' || m.kind === 'makeup' || m.kind === 'identity' || m.kind === 'pattern' || control) {
    // A project-local copy of the preview character wearing the item.
    const data: CharacterData = JSON.parse(JSON.stringify(base));
    if (m.kind in PART_KEYS) data.parts[PART_KEYS[m.kind]!] = ref;
    else if (m.kind === 'skin') data.colors.skin = (m.data as { skinTone?: { base: string } }).skinTone?.base ?? data.colors.skin!;
    else if (m.kind === 'body') {
      data.bodyBase = ref;
      data.body = {};
    }
    else if (m.kind === 'skin-detail' || m.kind === 'makeup') data.details = [ref];
    else if (m.kind === 'identity') data.rigVariant = ref;
    else if (control) {
      // A control shown away from its default (FR-AST-07): a slider at its far end, the last option, another colour.
      const value = control.type === 'slider' ? (control.range?.[1] ?? 100)
        : control.type === 'enum' ? [...(control.options ?? [])].reverse().find((o) => o !== control.default)
        : mostDifferent(control.presets ?? [], String(control.default ?? '#000000'));
      if (value !== undefined) data.controls = { ...data.controls, [ref]: value };
      // Hair controls read best on long hair (length, sway, greying of the lengths).
      if (m.kind === 'hair-ctl' && previewCharacter.hair) data.parts.hair = previewCharacter.hair;
    }
    else if (m.kind === 'pattern') {
      // A fabric pattern on the preview character's top and bottom (FR-WRD-02).
      const look = data.looks.find((l) => l.id === data.defaultLook) ?? data.looks[0]!;
      look.patterns = { top: { pattern: ref }, bottom: { pattern: ref } };
    }
    else {
      const look = data.looks.find((l) => l.id === data.defaultLook) ?? data.looks[0]!;
      const replaced = m.kind === 'dress' ? new Set(['top', 'bottom', 'dress']) : new Set([m.kind]);
      if (m.kind === 'acc') look.accessories = [ref];
      else look.garments = [...look.garments.filter((g) => !replaced.has(g.split('.')[0]!)), ref];
    }
    const copy = { ...previewCharacter.manifest, id: PREVIEW_USER_ID, version: 1, data } as AssetManifest;
    apply([{ name: 'asset.addLocal', params: { manifest: copy } }]);
    charRef = `${PREVIEW_USER_ID}@1`;
  }
  const inst = addCharacter(charRef, base.defaultLook);
  let t = 0;
  if (m.kind === 'eyestate' || m.kind === 'browstate') {
    // Eye and brow states (Catalog A6/A7) shown as a held expression with only those values.
    const st = (m.data as { eyeState?: Record<string, number>; browState?: Record<string, number> });
    const BROW: Record<string, string> = { inner: 'browInner', outer: 'browOuter', innerL: 'browInnerL', innerR: 'browInnerR', outerL: 'browOuterL', outerR: 'browOuterR', furrow: 'browFurrow' };
    const expression = st.eyeState ? { ...st.eyeState } : Object.fromEntries(Object.entries(st.browState ?? {}).map(([k, v]) => [BROW[k] ?? k, v]));
    const exp = { ...m, id: PREVIEW_USER_ID.replace(/ff$/, 'fc'), version: 1, kind: 'exp', data: { expression: { ...expression, intensity: 100, transition: 0 } } } as AssetManifest;
    apply([{ name: 'asset.addLocal', params: { manifest: exp } }]);
    const track = trackFor(s.state.scenes[scene]!, inst, 'face')!;
    apply([{ name: 'clip.add', params: { scene, track: track.id, start: 0, end: 48000 * 4, asset: `${exp.id}@1`, blendIn: 0, blendOut: 0 } }]);
    return { state: s.state, scene, t: 48000, framing: 'face', subject: inst };
  }
  if (control?.target === 'body') return { state: s.state, scene, t, framing: 'full', subject: inst };
  if (m.kind === 'exp' || m.kind === 'act' || m.kind === 'overlay') {
    const sc = s.state.scenes[scene]!;
    const track = trackFor(sc, inst, m.kind === 'act' ? 'acting' : 'face')!;
    apply([{ name: 'clip.add', params: { scene, track: track.id, start: 0, end: 48000 * 4, asset: ref, blendIn: 0, blendOut: 0 } }]);
    // Expressions read best once settled; actions at their midpoint.
    t = m.kind === 'act' ? 48000 * 1.2 : 48000;
  }
  if (m.kind === 'hand') {
    // A held pose: the right hand raised in front of the chest showing the hand shape.
    const pose = (m.data as { handPose?: string }).handPose ?? 'relaxed';
    const act = { ...m, id: PREVIEW_USER_ID.replace(/ff$/, 'fd'), version: 1, kind: 'act', name: 'Hand preview', data: { action: { channels: ['armR', 'handR'], duration: 2, hand: 'R', loop: false, postures: ['standing'], keys: { armR: [{ t: 0, v: [0.32, -0.25, 0.9] }], handR: [{ t: 0, v: pose }] } } } } as AssetManifest;
    apply([{ name: 'asset.addLocal', params: { manifest: act } }]);
    const track = trackFor(s.state.scenes[scene]!, inst, 'acting')!;
    apply([{ name: 'clip.add', params: { scene, track: track.id, start: 0, end: 48000 * 2, asset: `${act.id}@1`, blendIn: 0, blendOut: 0 } }]);
    return { state: s.state, scene, t: 48000, framing: 'upper', subject: inst };
  }
  if (m.kind === 'mouthshape') {
    // A line whose alignment holds one phoneme of this shape (preview only; no audio exists).
    const ph = (m.data as { phonemes?: string[] }).phonemes ?? [];
    const line = apply([{ name: 'line.add', params: { scene, speaker: inst, text: 'Preview', start: 0, durationS: 2 } }]).commands[0]!.params.id as string;
    const alignment = { method: 'fixture' as const, confidence: 1, words: [], phonemes: ph.length ? [{ p: ph[0]!, start: 0.2, end: 1.8 }] : [] };
    const take = apply([{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'recorded', fixture: true, status: 'ready', durationS: 2, alignment } } }]).commands[0]!.params.id as string;
    apply([{ name: 'line.chooseTake', params: { scene, id: line, take } }]);
    return { state: s.state, scene, t: 48000, framing: 'face', subject: inst };
  }
  if (m.kind === 'txt') {
    // Caption styles: an enlarged local copy of the style over an empty stage so the thumbnail is legible.
    const cap = (m.data as { caption?: { size: number; maxChars: number } }).caption;
    if (!cap) return undefined;
    const copy = { ...m, id: PREVIEW_USER_ID.replace(/ff$/, 'fe'), version: 1, data: { caption: { ...cap, size: Math.min(0.2, cap.size * 3.2), maxChars: 12 } } } as AssetManifest;
    apply([{ name: 'asset.addLocal', params: { manifest: copy } }]);
    apply([{ name: 'project.setSettings', params: { captions: { enabled: true, burnIn: true, speakerLabels: false, style: `${copy.id}@1` } } }]);
    apply([{ name: 'instance.update', params: { scene, id: inst, set: { visible: false } } }]);
    apply([{ name: 'line.add', params: { scene, speaker: inst, text: 'Aa Bb', start: 0, durationS: 3 } }]);
    return { state: s.state, scene, t: 48000, framing: 'scene' };
  }
  return { state: s.state, scene, t, framing: FACE_FRAMED.has(m.kind) ? 'face' : 'full', subject: inst };
}

/**
 * Evaluates the preview and points the camera at what is actually drawn. `measure` returns the bounding box of
 * visible pixels of a frame (the caller owns the renderer); without it the composed bounds are used.
 */
export function previewFrame(
  setup: PreviewSetup,
  o: Omit<EvalOptions, 'width' | 'height'> & { width: number; height: number },
  measure?: (frame: ReturnType<typeof evaluateFrame>['frame']) => { x: number; y: number; w: number; h: number } | undefined,
) {
  const { state, scene, t, framing, subject } = setup;
  if (framing === 'scene' || !subject) return evaluateFrame(state, scene, t, o);
  // Probe: the whole stage, transparent, with only the subject visible.
  const sc0 = state.scenes[scene]!;
  const only: ProjectState = { ...state, scenes: { ...state.scenes, [scene]: { ...sc0, instances: sc0.instances.map((i) => ({ ...i, visible: i.id === subject })) } } };
  const probe = evaluateFrame(only, scene, t, { ...o, width: 480, height: 270, background: '#00000000', captions: false });
  const b = measure?.(probe.frame) ?? probe.boxes[subject];
  if (!b || b.w <= 0 || b.h <= 0) return evaluateFrame(state, scene, t, o);
  const k = 1920 / 480;
  const top = b.y * k;
  const h = b.h * k;
  const w = b.w * k;
  const cx = (b.x + b.w / 2) * k;
  // Face framing shows the head (top ~22 % of a standing character); full framing shows everything with margin.
  const span = framing === 'face' ? h * 0.24 : framing === 'upper' ? h * 0.55 : h;
  const pad = framing === 'face' ? 1.25 : 1.1;
  // Cameras frame by width at the project's design aspect and keep that height at other aspects (viewMatrix), so
  // the visible height is camW / designAspect and the visible width is that height × the output aspect.
  const design = state.project.output.width / state.project.output.height;
  const aspect = o.width / o.height;
  const needW = (framing === 'full' ? w : Math.min(w, span * 1.2)) * pad;
  const camW = Math.max(span * pad, needW / aspect) * design;
  const cam = { ...sc0.cameras[0]!, center: { x: cx, y: top + span / 2 - (framing === 'face' ? span * 0.02 : 0) }, width: camW };
  const next: ProjectState = { ...state, scenes: { ...state.scenes, [scene]: { ...sc0, cameras: [cam] } } };
  return evaluateFrame(next, scene, t, o);
}

/** A turnaround sheet (FR-CLI-05 `char sheet`): the character in all four views side by side, in a look. */
export function sheetSetup(ref: string, m: AssetManifest, look?: string): PreviewSetup {
  const ids = sequentialIds(1);
  const state = createProjectState(ids, { name: 'Sheet', styleFamily: 'flat', frameRate: 24, output: { preset: 'sheet', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: 'preview', now: '2000-01-01T00:00:00Z', seed: 1 });
  const s = new ProjectSession(state, 0, { newId: ids, now: () => '2000-01-01T00:00:00Z' });
  const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const data = m.data as CharacterData;
  const views = ['front', 'three', 'side', 'back'];
  s.apply({ commands: views.map((view, i) => ({ name: 'instance.add', params: { scene, kind: 'character', asset: ref, name: view, transform: { x: 240 + i * 480, y: 1000 }, character: { look: look ?? data.defaultLook, view, posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } })) });
  return { state: s.state, scene, t: 0, framing: 'scene' };
}
