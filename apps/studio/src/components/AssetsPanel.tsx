/** Library browser (Design System §5.3, FR-AST-03/04): search, categories with live counts, apply to the scene. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Star, Upload } from 'lucide-react';
import { AssetRow, Button, EmptyState, IconButton, Panel, SearchField, Section, Segmented, Select, useToasts } from '@frame/ui';
import { ImportDialog, IMPORT_ACCEPT } from './ImportDialog.js';
import { trackFor } from '@frame/core';
import { api, type UserPrefs } from '../lib/api.js';
import { useStudio, type Studio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

export const DRAG_TYPE = 'application/x-frame-asset';

export interface Hit {
  ref: string;
  preview?: boolean;
  kind: string;
  name: string;
  category: string;
  group?: string;
  tags: string[];
  /** Why the item cannot be applied to the current selection (FR-AST-04). */
  incompatible?: string;
  /** bundled, user, project or imported (FR-AST-01). */
  source?: string;
}

/** Which library kinds each rail destination shows (Design System §4.3). */
const FILTERS: Record<string, { title: string; kinds?: string[]; empty: string }> = {
  assets: { title: 'Assets', empty: 'No assets match.' },
  cast: { title: 'Cast', kinds: ['chr'], empty: 'No characters in the library.' },
  text: { title: 'Text', kinds: ['txt'], empty: 'No text styles in the library.' },
  effects: { title: 'Effects', kinds: ['fx', 'atmo', 'tr'], empty: 'Effects are not in the library yet. They arrive with the effects content set.' },
  audio: { title: 'Audio', kinds: ['music', 'cue', 'amb', 'sfx', 'voice'], empty: 'Sounds are not in the library yet; they arrive with the sound content set. Voices you design (Scene → Design a voice) appear here.' },
  templates: { title: 'Templates', kinds: ['tpl'], empty: 'Templates are not in the library yet. They arrive with the templates content set.' },
};

/** Character parts and garments that open in the part editor (FR-PED-01). */
const PART_KINDS = new Set(['head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'feet', 'top', 'outer', 'bottom', 'dress', 'shoe', 'acc', 'skin-detail', 'makeup']);

/** Kinds that can be placed or applied from this panel. */
const PLACEABLE = new Set(['chr', 'prop', 'exp', 'act', 'txt', 'kit', 'set', 'img', 'rcp', 'cam', 'sfx', 'atmo', 'fx', 'tr', 'music', 'amb', 'cue', 'tpl']);

export function AssetsPanel({ filter }: { filter: string }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const sceneId = useStudio(studio, (s) => s.scene);
  const selection = useStudio(studio, (s) => s.selection);
  const project = useStudio(studio, (s) => s.project)!;
  const [q, setQ] = useState('');
  const [all, setAll] = useState<Hit[]>();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<string>();
  const [importing, setImporting] = useState<File>();
  const [scope, setScope] = useState<string>('all');
  const [prefs, setPrefsState] = useState<UserPrefs>();
  useEffect(() => {
    api.prefs().then(setPrefsState).catch(() => setPrefsState(undefined));
  }, []);
  const savePrefs = (next: Omit<UserPrefs, 'schemaVersion'>) => api.setPrefs(next).then(setPrefsState).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
  const idOf = (ref: string) => ref.slice(0, ref.lastIndexOf('@'));
  const fileInput = useRef<HTMLInputElement>(null);
  const f = FILTERS[filter] ?? FILTERS.assets!;

  const scene0 = sceneId ? project.scenes[sceneId] : undefined;
  const selCharId = selection.find((s) => s.kind === 'instance' && scene0?.instances.find((i) => i.id === s.id)?.kind === 'character')?.id;
  const selView = selCharId ? scene0?.instances.find((i) => i.id === selCharId)?.character?.view : undefined;
  useEffect(() => {
    let live = true;
    const kinds = f.kinds;
    const sel = sceneId && selCharId ? { scene: sceneId, instance: selCharId } : undefined;
    Promise.all((kinds ?? [undefined]).map((k) => api.library(q, k, pid, 500, sel))).then((rs) => live && setAll(rs.flatMap((r) => r.results))).catch(() => live && setAll([]));
    return () => {
      live = false;
    };
  }, [q, filter, pid, f.kinds, sceneId, selCharId, selView]);

  const groups = useMemo(() => {
    const m = new Map<string, Hit[]>();
    const coll = scope.startsWith('col:') ? prefs?.collections.find((c) => c.id === scope.slice(4)) : undefined;
    for (const h of all ?? []) {
      if (h.kind === 'base' || h.kind === 'out') continue;
      // Favourites, my library, this project, or a collection (FR-AST-01/06).
      if (scope === 'fav' && !prefs?.favourites.includes(idOf(h.ref))) continue;
      if (scope === 'user' && h.source !== 'user') continue;
      if (scope === 'project' && h.source !== 'project') continue;
      if (coll && !coll.items.includes(idOf(h.ref))) continue;
      const list = m.get(h.category) ?? [];
      list.push(h);
      m.set(h.category, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all, scope, prefs]);

  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const selChar = selection.find((s) => s.kind === 'instance' && scene?.instances.find((i) => i.id === s.id)?.kind === 'character');

  const reason = (h: Hit): string | undefined => {
    if (!PLACEABLE.has(h.kind)) return 'Editing these is part of the character builder';
    if (h.incompatible) return h.incompatible;
    if ((h.kind === 'exp' || h.kind === 'overlay' || h.kind === 'act') && !selChar) return 'Select a character first';
    return undefined;
  };

  const apply = async (h: Hit) => {
    const msg = await placeAsset(studio, h, { character: selChar?.id });
    if (msg) toasts.show({ tone: 'success', message: msg });
  };

  const pickedHit = all?.find((h) => h.ref === picked);
  return (
    <Panel title={f.title} label={f.title} help="#/help/assets" actions={<><IconButton label="Open the full library" icon={<Maximize2 size={16} />} onClick={() => (location.hash = `#/p/${encodeURIComponent(pid)}/library`)} /><IconButton label="Import a file…" icon={<Upload size={16} />} onClick={() => fileInput.current?.click()} /></>} search={<SearchField label={`Search ${f.title.toLowerCase()}`} placeholder={`Search ${f.title.toLowerCase()}`} value={q} onChange={setQ} />} className="st-left">
      {all === undefined ? <p className="fr-faint" style={{ padding: 12 }}>Loading library…</p> : groups.length === 0 ? (
        <EmptyState title={q ? 'No matches' : f.title}>{q ? `Nothing matches “${q}”.` : f.empty}</EmptyState>
      ) : groups.map(([cat, hits]) => (
        <Section key={cat} title={cat} summary={String(hits.length)} open={open[cat] ?? (groups.length <= 3 || q !== '')} onToggle={(o) => setOpen((x) => ({ ...x, [cat]: o }))}>
          {hits.slice(0, 60).map((h) => (
            <AssetRow
              key={h.ref}
              name={h.name}
              meta={h.group && h.group !== cat ? h.group : h.ref.split('@')[0]}
              thumbnail={h.preview ? <img src={`/api/library/thumbnail?ref=${encodeURIComponent(h.ref)}&family=${project.project.styleFamily}&w=60&project=${encodeURIComponent(pid)}`} width={30} height={30} alt="" loading="lazy" /> : undefined}
              // Parts and garments are picked for editing (part editor) even though they are applied in the builder.
              disabledReason={PART_KINDS.has(h.kind) && !h.incompatible ? undefined : reason(h)}
              selected={picked === h.ref}
              onClick={() => setPicked(h.ref)}
              onDoubleClick={() => !reason(h) && void apply(h)}
              draggable={!reason(h)}
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(h)); e.dataTransfer.effectAllowed = 'copy'; }}
            />
          ))}
          {hits.length > 60 && <p className="fr-faint" style={{ padding: '4px 12px' }}>{hits.length - 60} more · refine the search to see them</p>}
        </Section>
      ))}
      <div className="st-assets-scope">
        <Segmented label="Show" value={scope.startsWith('col:') ? 'all' : scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'fav', label: 'Favourites' }, { value: 'user', label: 'My library' }, { value: 'project', label: 'Project' }]} />
        {!!prefs?.collections.length && <span className="st-tb-select"><Select label="Collection" placeholder="Collection" value={scope.startsWith('col:') ? scope : undefined} onChange={setScope} options={[...prefs.collections.map((c) => ({ value: `col:${c.id}`, label: c.name }))]} /></span>}
      </div>
      <input ref={fileInput} type="file" hidden accept={IMPORT_ACCEPT} aria-label="Import a file" onChange={(e) => { setImporting(e.target.files?.[0]); e.target.value = ''; }} />
      <ImportDialog file={importing} onClose={() => setImporting(undefined)} />
      {pickedHit && (
        <div className="st-panel-foot st-panel-foot--wrap">
          <span className="fr-faint">{pickedHit.name}</span>
          <span className="fr-spacer" />
          {prefs && <IconButton label={prefs.favourites.includes(idOf(pickedHit.ref)) ? 'Remove from favourites' : 'Add to favourites'} pressed={prefs.favourites.includes(idOf(pickedHit.ref))} icon={<Star size={16} />} onClick={() => {
            const id = idOf(pickedHit.ref);
            const fav = prefs.favourites.includes(id) ? prefs.favourites.filter((x) => x !== id) : [...prefs.favourites, id];
            void savePrefs({ favourites: fav, collections: prefs.collections });
          }} />}
          {prefs && <span className="st-tb-select"><Select label="Add to collection" placeholder="Collection…" value={undefined} onChange={(v) => {
            const id = idOf(pickedHit.ref);
            if (v === '__new') {
              const name = window.prompt('Name the new collection');
              if (!name?.trim()) return;
              void savePrefs({ favourites: prefs.favourites, collections: [...prefs.collections, { id: `c${Date.now().toString(36)}`, name: name.trim(), items: [id] }] });
            } else void savePrefs({ favourites: prefs.favourites, collections: prefs.collections.map((c) => (c.id === v ? { ...c, items: c.items.includes(id) ? c.items.filter((x) => x !== id) : [...c.items, id] } : c)) });
          }} options={[...prefs.collections.map((c) => ({ value: c.id, label: `${c.items.includes(idOf(pickedHit.ref)) ? '✓ ' : ''}${c.name}` })), { value: '__new', label: 'New collection…' }]} /></span>}
          {PART_KINDS.has(pickedHit.kind) && <Button onClick={() => (location.hash = `#/p/${encodeURIComponent(pid)}/part/${encodeURIComponent(pickedHit.ref)}`)}>Open in part editor</Button>}
          {pickedHit.source === 'project' && pickedHit.ref.startsWith('user.') && <Button onClick={() => void api.saveToLibrary(pid, [pickedHit.ref]).then((r) => toasts.show({ tone: 'success', message: r.added.length ? `Saved ${pickedHit.name} to your library` : `${pickedHit.name} is already in your library` })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}>Save to my library</Button>}
          <Button variant="primary" disabled={!!reason(pickedHit)} disabledReason={reason(pickedHit)} onClick={() => void apply(pickedHit)}>{pickedHit.kind === 'exp' || pickedHit.kind === 'overlay' || pickedHit.kind === 'act' || pickedHit.kind === 'sfx' || pickedHit.kind === 'music' || pickedHit.kind === 'amb' || pickedHit.kind === 'cue' || pickedHit.kind === 'atmo' || pickedHit.kind === 'fx' ? 'Add at playhead' : pickedHit.kind === 'txt' && pickedHit.tags.includes('caption') ? 'Use for captions' : pickedHit.kind === 'txt' ? 'Add at playhead' : pickedHit.kind === 'rcp' ? 'Apply…' : pickedHit.kind === 'tpl' ? 'New scene…' : 'Add to scene'}</Button>
        </div>
      )}
    </Panel>
  );
}

/**
 * Places or applies a library item (shared by the panel, canvas drops and timeline drops, Design System §8).
 * Returns a confirmation message for non-visual changes.
 */
export async function placeAsset(studio: Studio, h: Hit, o: { at?: number; position?: { x: number; y: number }; character?: string } = {}): Promise<string | undefined> {
  const s = studio.state;
  const project = s.project!;
  const scene = s.scene ? project.scenes[s.scene] : undefined;
  if (!scene) return undefined;
  if (h.incompatible) {
    studio.set({ lastError: { message: `${h.name}: ${h.incompatible}` } });
    return undefined;
  }
  // Assets from the user library are copied into the project first, so it stays self-contained (FR-DAT-06).
  if (h.source === 'user') await api.adopt(s.pid, [h.ref]);
  const at = o.at ?? s.time;
  const pos = o.position;
  const cx = project.project.output.width / 2;
  switch (h.kind) {
    case 'chr': {
      const m = (await api.manifest(h.ref, s.pid)) as { data: { defaultLook: string } };
      await studio.exec([{ name: 'instance.add', params: { scene: scene.id, kind: 'character', asset: h.ref, name: h.name, transform: { x: pos?.x ?? cx, y: pos?.y ?? project.project.output.height * 0.92 }, character: { look: m.data.defaultLook, view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }], `Add ${h.name}`);
      return undefined;
    }
    case 'img':
      await studio.exec([{ name: 'instance.add', params: { scene: scene.id, kind: 'image', asset: h.ref, name: h.name, transform: { x: pos?.x ?? cx, y: pos?.y ?? project.project.output.height / 2 } } }], `Add ${h.name}`);
      return undefined;
    case 'prop':
      await studio.exec([{ name: 'instance.add', params: { scene: scene.id, kind: 'prop', asset: h.ref, name: h.name, transform: { x: pos?.x ?? cx, y: pos?.y ?? project.project.output.height * 0.8 } } }], `Add ${h.name}`);
      return undefined;
    case 'kit': {
      const m = (await api.manifest(h.ref, s.pid)) as { data: { kit: { parts: Record<string, { plane?: string; at?: [number, number]; order?: number; name?: string }> } } };
      // Behind what is already on each plane, in the kit's own order.
      const parts = Object.entries(m.data.kit.parts).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
      const lowest = (plane: string) => Math.min(0, ...scene.instances.filter((i) => i.depthPlane === plane).map((i) => i.order));
      await studio.exec(parts.map(([part, p]) => ({ name: 'instance.add', params: { scene: scene.id, kind: 'set-piece', asset: h.ref, name: p.name ?? part[0]!.toUpperCase() + part.slice(1), transform: { x: p.at?.[0] ?? cx, y: p.at?.[1] ?? project.project.output.height }, depthPlane: p.plane ?? 'back', order: lowest(p.plane ?? 'back') - 100 + (p.order ?? 0), params: { part } } })), `Add ${h.name}`);
      return undefined;
    }
    case 'exp':
    case 'overlay':
    case 'act': {
      if (!o.character) return undefined;
      const track = trackFor(scene, o.character, h.kind === 'act' ? 'acting' : 'face');
      if (!track) return undefined;
      await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: at, end: Math.min(scene.duration, at + 96000), asset: h.ref, blendIn: 4800, blendOut: 4800 } }], `${h.name}`);
      return undefined;
    }
    case 'rcp':
      studio.set({ recipe: { ref: h.ref, name: h.name } });
      return undefined;
    case 'set':
      await api.applySet(s.pid, scene.id, h.ref);
      return `${h.name} set added`;
    case 'tpl':
      studio.set({ template: { ref: h.ref, name: h.name } });
      return undefined;
    case 'atmo':
    case 'fx': {
      // Atmosphere and effects are timed clips on the scene's effect track; effects attach to the selected object.
      const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'effect');
      if (!track) return undefined;
      const attach = s.selection.find((x) => x.kind === 'instance')?.id;
      const len = h.kind === 'atmo' ? Math.max(48000, scene.duration - at) : 96000;
      await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: at, end: Math.min(scene.duration, at + len), asset: h.ref, blendIn: h.kind === 'atmo' ? 24000 : 0, blendOut: h.kind === 'atmo' ? 24000 : 0, params: h.kind === 'fx' && attach ? { attach } : {} } }], `Add ${h.name}`);
      return undefined;
    }
    case 'tr': {
      // A transition goes on the shot that starts at or before the playhead (FR-FX-03).
      const shotTrack = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot');
      const shot = scene.clips.filter((c) => c.track === shotTrack?.id && c.start <= at).sort((a, b) => b.start - a.start)[0];
      if (!shot) return 'Add a shot first: transitions blend into the shot that starts at the playhead.';
      await studio.exec([{ name: 'clip.update', params: { scene: scene.id, id: shot.id, set: { params: { transition: h.ref, transitionS: shot.params.transitionS ?? 0.5 } } } }], `${h.name} into shot`);
      return `${h.name} added to the shot starting at ${(shot.start / 48000).toFixed(1)} s.`;
    }
    case 'sfx':
    case 'cue':
    case 'music':
    case 'amb': {
      // Library sounds go on their track at the playhead (FR-SND-01); music and ambience loop to the scene end.
      const m = (await api.manifest(h.ref, s.pid)) as { data: { sound?: { media?: { durationS?: number }; loop?: boolean } } };
      const kind = h.kind === 'music' ? 'music' : h.kind === 'amb' ? 'ambience' : 'sfx';
      const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === kind);
      if (!track) return undefined;
      const dur = m.data.sound?.loop ? scene.duration - at : Math.round((m.data.sound?.media?.durationS ?? 1) * 48000);
      await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: at, end: Math.min(scene.duration, at + dur), asset: h.ref } }], `Add ${h.name}`);
      return undefined;
    }
    case 'cam': {
      // Shot recipes open the recipe dialog; framings frame the selected objects; moves go on the camera track.
      const m = (await api.manifest(h.ref, s.pid)) as { data: { recipe?: unknown; framing?: unknown; move?: unknown } };
      if (m.data.recipe) {
        studio.set({ recipe: { ref: h.ref, name: h.name } });
        return undefined;
      }
      if (m.data.framing) {
        const subjects = s.selection.filter((x) => x.kind === 'instance').map((x) => x.id);
        const r = await api.frameCamera(s.pid, scene.id, { preset: h.ref, subjects, at });
        return `Added a ${h.name.toLowerCase()} camera${subjects.length ? '' : ' on the stage'} (${r.camera}). Put it on the Shot track to cut to it.`;
      }
      const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'camera-move');
      if (!track) return undefined;
      await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: at, end: Math.min(scene.duration, at + 96000), asset: h.ref } }], h.name);
      return undefined;
    }
    case 'txt': {
      // Bubbles, titles, graphics and world text are clips on the text track; caption styles set the captions.
      const m = (await api.manifest(h.ref, s.pid)) as { data: { bubble?: unknown; graphic?: unknown; world?: unknown } };
      if (m.data.bubble || m.data.graphic || m.data.world) {
        const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'text');
        if (!track) return undefined;
        const who = s.selection.find((x) => x.kind === 'instance')?.id;
        // A bubble on a character defaults to the line they speak at the playhead.
        const line = m.data.bubble && who ? scene.clips.find((c) => c.line?.speaker === who && c.start <= at + 48000 && c.end > at) : undefined;
        const text = line ? '' : window.prompt(`${h.name}: text`, m.data.graphic ? 'Title' : '') ?? '';
        if (!line && !text.trim()) return undefined;
        const start = line?.start ?? at;
        const end = line?.end ?? Math.min(scene.duration, at + 4 * 48000);
        const params: Record<string, unknown> = { ...(line ? { line: line.id } : { text: text.trim() }), ...(who && !m.data.world ? { attach: who } : {}) };
        if (m.data.world) Object.assign(params, { x: pos?.x ?? project.project.output.width / 2, y: pos?.y ?? project.project.output.height * 0.35, width: 320 });
        await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start, end, asset: h.ref, params } }], `Add ${h.name}`);
        return undefined;
      }
      await studio.exec([{ name: 'project.setSettings', params: { captions: { ...project.project.captions, style: h.ref } } }], `Caption style ${h.name}`);
      return `Captions now use ${h.name}.`;
    }
  }
  return undefined;
}
