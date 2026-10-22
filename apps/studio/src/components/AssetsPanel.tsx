/** Library browser (Design System §5.3, FR-AST-03/04): search, categories with live counts, apply to the scene. */
import { useEffect, useMemo, useState } from 'react';
import { AssetRow, Button, EmptyState, Panel, SearchField, Section, useToasts } from '@frame/ui';
import { trackFor } from '@frame/core';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Hit {
  ref: string;
  kind: string;
  name: string;
  category: string;
  group?: string;
  tags: string[];
}

/** Which library kinds each rail destination shows (Design System §4.3). */
const FILTERS: Record<string, { title: string; kinds?: string[]; empty: string }> = {
  assets: { title: 'Assets', empty: 'No assets match.' },
  cast: { title: 'Cast', kinds: ['chr'], empty: 'No characters in the library.' },
  text: { title: 'Text', kinds: ['txt'], empty: 'No text styles in the library.' },
  effects: { title: 'Effects', kinds: ['fx', 'atmo', 'tr'], empty: 'Effects are not in the library yet. They arrive with the effects content set.' },
  audio: { title: 'Audio', kinds: ['snd', 'mus', 'amb', 'sfx', 'voice'], empty: 'Sounds are not in the library yet. Import audio or design a voice from the Scene menu.' },
  templates: { title: 'Templates', kinds: ['tpl'], empty: 'Templates are not in the library yet. They arrive with the templates content set.' },
};

/** Kinds that can be placed or applied from this panel. */
const PLACEABLE = new Set(['chr', 'prop', 'exp', 'act', 'txt', 'kit']);

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
  const f = FILTERS[filter] ?? FILTERS.assets!;

  useEffect(() => {
    let live = true;
    const kinds = f.kinds;
    Promise.all((kinds ?? [undefined]).map((k) => api.library(q, k, pid, 500))).then((rs) => live && setAll(rs.flatMap((r) => r.results))).catch(() => live && setAll([]));
    return () => {
      live = false;
    };
  }, [q, filter, pid, f.kinds]);

  const groups = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const h of all ?? []) {
      if (h.kind === 'base' || h.kind === 'out') continue;
      const list = m.get(h.category) ?? [];
      list.push(h);
      m.set(h.category, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const selChar = selection.find((s) => s.kind === 'instance' && scene?.instances.find((i) => i.id === s.id)?.kind === 'character');

  const reason = (h: Hit): string | undefined => {
    if (!PLACEABLE.has(h.kind)) return 'Editing these is part of the character builder';
    if ((h.kind === 'exp' || h.kind === 'act') && !selChar) return 'Select a character first';
    return undefined;
  };

  const apply = async (h: Hit) => {
    if (!scene) return;
    const at = studio.state.time;
    const cx = project.project.output.width / 2;
    switch (h.kind) {
      case 'chr': {
        const m = (await api.manifest(h.ref, pid)) as { data: { defaultLook: string } };
        await studio.exec([{ name: 'instance.add', params: { scene: scene.id, kind: 'character', asset: h.ref, name: h.name, transform: { x: cx, y: project.project.output.height * 0.92 }, character: { look: m.data.defaultLook, view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }]);
        break;
      }
      case 'prop':
        await studio.exec([{ name: 'instance.add', params: { scene: scene.id, kind: 'prop', asset: h.ref, name: h.name, transform: { x: cx, y: project.project.output.height * 0.8 } } }]);
        break;
      case 'kit': {
        const m = (await api.manifest(h.ref, pid)) as { data: { kit: { parts: Record<string, { plane?: string; at?: [number, number] }> } } };
        const parts = Object.entries(m.data.kit.parts);
        await studio.exec(parts.map(([part, p]) => ({ name: 'instance.add', params: { scene: scene.id, kind: 'set-piece', asset: h.ref, name: part[0]!.toUpperCase() + part.slice(1), transform: { x: p.at?.[0] ?? cx, y: p.at?.[1] ?? project.project.output.height }, depthPlane: p.plane ?? 'back', params: { part } } })), `Add ${h.name}`);
        break;
      }
      case 'exp':
      case 'act': {
        const track = trackFor(scene, selChar!.id, h.kind === 'exp' ? 'face' : 'acting');
        if (!track) return;
        const len = Math.round(48000 * 2);
        await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: at, end: Math.min(scene.duration, at + len), asset: h.ref, blendIn: 4800, blendOut: 4800 } }]);
        break;
      }
      case 'txt':
        await studio.exec([{ name: 'project.setSettings', params: { captions: { ...project.project.captions, style: h.ref } } }], `Caption style ${h.name}`);
        toasts.show({ tone: 'success', message: `Captions now use ${h.name}.` });
        break;
    }
  };

  const pickedHit = all?.find((h) => h.ref === picked);
  return (
    <Panel title={f.title} label={f.title} search={<SearchField label={`Search ${f.title.toLowerCase()}`} placeholder={`Search ${f.title.toLowerCase()}`} value={q} onChange={setQ} />} className="st-left">
      {all === undefined ? <p className="fr-faint" style={{ padding: 12 }}>Loading library…</p> : groups.length === 0 ? (
        <EmptyState title={q ? 'No matches' : f.title}>{q ? `Nothing matches “${q}”.` : f.empty}</EmptyState>
      ) : groups.map(([cat, hits]) => (
        <Section key={cat} title={cat} summary={String(hits.length)} open={open[cat] ?? (groups.length <= 3 || q !== '')} onToggle={(o) => setOpen((x) => ({ ...x, [cat]: o }))}>
          {hits.slice(0, 60).map((h) => (
            <AssetRow
              key={h.ref}
              name={h.name}
              meta={h.group && h.group !== cat ? h.group : h.ref.split('@')[0]}
              disabledReason={reason(h)}
              selected={picked === h.ref}
              onClick={() => setPicked(h.ref)}
              onDoubleClick={() => void apply(h)}
              draggable={!reason(h)}
              onDragStart={(e) => e.dataTransfer.setData('application/x-frame-asset', h.ref)}
            />
          ))}
          {hits.length > 60 && <p className="fr-faint" style={{ padding: '4px 12px' }}>{hits.length - 60} more · refine the search to see them</p>}
        </Section>
      ))}
      {pickedHit && (
        <div className="st-panel-foot">
          <span className="fr-faint">{pickedHit.name}</span>
          <span className="fr-spacer" />
          <Button variant="primary" disabled={!!reason(pickedHit)} disabledReason={reason(pickedHit)} onClick={() => void apply(pickedHit)}>{pickedHit.kind === 'exp' || pickedHit.kind === 'act' ? 'Add at playhead' : pickedHit.kind === 'txt' ? 'Use for captions' : 'Add to scene'}</Button>
        </div>
      )}
    </Panel>
  );
}
