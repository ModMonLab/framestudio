/**
 * Rigging assistant (FR-IMP-03, Design System §7.3): layered artwork → a character. Layers are listed by view with a
 * suggested rig target each (by name convention) that the user can change; a live preview shows the rigged result in
 * every drawn view with a test gesture; mouth shapes the drawing lacks can come from a library mouth; the rig check
 * must pass (view gaps are declared, P11) before the character is saved and placed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateFrame, type ProjectState } from '@frame/core';
import type { AssetManifest, Clip, Instance, Scene, View } from '@frame/schema';
import { Button, Chip, Dialog, EmptyState, Select, StatusBadge, TextField, useToasts } from '@frame/ui';
import type { Renderer } from '@frame/render';
import { api } from '../lib/api.js';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { useStudio } from '../lib/store.js';
import { useKind } from './BuilderProperties.js';
import { useCtx } from './Workspace.js';

interface ReadLayer { id: string; name: string; view?: View; group?: string; hidden: boolean; bounds: [number, number, number, number]; media?: string; paths?: unknown[]; suggestion: string }
interface ReadResult { fileName: string; source: 'psd' | 'svg'; width: number; height: number; views: View[]; layers: ReadLayer[]; warnings: string[]; targets: { value: string; label: string }[] }
interface BuildResult { character: AssetManifest; parts: AssetManifest[]; views: View[]; mouthShapes: string[]; problems: { severity: 'error' | 'warning'; message: string }[]; check: { ok: boolean; problems: { severity: 'error' | 'warning'; message: string }[]; views: string[]; actions: { compatible: number; total: number } }; ok: boolean }

const VIEW_LABEL: Record<View, string> = { front: 'Front', three: 'Three-quarter', side: 'Side', back: 'Back' };

export function RiggingAssistant({ file, onClose }: { file: File | undefined; onClose: () => void }) {
  const { studio, assets } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const [read, setRead] = useState<ReadResult>();
  const [error, setError] = useState<string>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [rights, setRights] = useState('I made this artwork or own the rights to it');
  const [libMouth, setLibMouth] = useState('');
  const [built, setBuilt] = useState<BuildResult>();
  const [busy, setBusy] = useState(false);
  const [gesture, setGesture] = useState('');
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<string, unknown>>();
  const [, setTick] = useState(0);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const mouths = useKind('mouth', pid);
  const acts = useKind('act', pid);

  useEffect(() => {
    void getRenderer().then(setRenderer);
    void getStyles().then((s) => setStyles(s as never));
    const off = assets.onChange(() => setTick((t) => t + 1));
    return () => {
      off();
    };
  }, [assets]);

  useEffect(() => {
    setRead(undefined);
    setBuilt(undefined);
    setError(undefined);
    if (!file) return;
    setName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    void file.arrayBuffer().then((b) => api.readArtwork(pid, file.name, new Uint8Array(b))).then((r) => {
      setRead(r as ReadResult);
      setMapping(Object.fromEntries((r as ReadResult).layers.map((l) => [l.id, l.suggestion])));
    }).catch((e: Error) => setError(e.message));
  }, [file, pid]);

  const layersPayload = useMemo(() => read?.layers.map(({ suggestion: _s, hidden: _h, group: _g, ...l }) => l), [read]);
  // Dry-run build on every change (debounced): manifests for the preview and the rig check.
  useEffect(() => {
    if (!read || !layersPayload || !name.trim()) return;
    const t = setTimeout(() => {
      api.buildRig(pid, { name, fileName: read.fileName, rights, layers: layersPayload, mapping, ...(libMouth ? { libraryParts: { mouth: libMouth } } : {}) })
        .then((r) => setBuilt(r as BuildResult))
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [read, layersPayload, mapping, libMouth, name, rights, pid]);

  // Preview: the rigged draft on a neutral copy of the current scene, in every drawn view.
  const local = useMemo(() => new Map((built ? [...built.parts, built.character] : []).map((m) => [`${m.id}@${m.version}`, m])), [built]);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  useEffect(() => {
    if (!renderer || !styles || !built || !scene) return;
    const resolve = (r: string) => local.get(r) ?? assets.manifest(r);
    built.views.forEach((v, i) => {
      const cv = canvases.current[i];
      if (!cv) return;
      const state = previewState(project, scene, `${built.character.id}@1`, v, gesture);
      const ev = evaluateFrame(state, scene.id, 24000, { assets: { manifest: resolve }, styles: styles as never, width: 240, height: 320, family: project.project.styleFamily, background: '#00000000' });
      blit(renderer, ev.frame, cv);
    });
  });

  const save = async () => {
    if (!read || !layersPayload) return;
    setBusy(true);
    try {
      const r = await api.buildRig(pid, { name, fileName: read.fileName, rights, layers: layersPayload, mapping, ...(libMouth ? { libraryParts: { mouth: libMouth } } : {}), save: true, ...(sceneId ? { place: { scene: sceneId, x: project.project.output.width / 2, y: project.project.output.height * 0.92 } } : {}) });
      toasts.show({ tone: 'success', message: `${name} is rigged${sceneId ? ' and placed in the scene' : ''}` });
      if ((r as { instance?: string }).instance) studio.set({ selection: [{ kind: 'instance', id: (r as { instance: string }).instance }] });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const problems = built ? [...built.problems, ...built.check.problems] : [];
  const errors = problems.filter((x) => x.severity === 'error');
  const byView = useMemo(() => {
    const out = new Map<string, ReadLayer[]>();
    for (const l of read?.layers ?? []) out.set(l.view ?? 'front', [...(out.get(l.view ?? 'front') ?? []), l]);
    return [...out.entries()];
  }, [read]);

  return (
    <Dialog
      title={file ? `Rigging assistant — ${file.name}` : 'Rigging assistant'}
      open={!!file}
      onClose={onClose}
      wide
      footer={<>
        <span className="fr-faint st-grow">{built ? `${built.views.map((v) => VIEW_LABEL[v]).join(', ')} drawn · ${built.mouthShapes.length} of 9 mouth shapes · ${built.check.actions.compatible} compatible actions` : ''}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!built?.ok || !name.trim()} disabledReason={!name.trim() ? 'Name the character' : 'Fix the problems listed first'}>Save character</Button>
      </>}
    >
      {error && <p role="alert" className="st-error">{error}</p>}
      {!read && !error && <p className="fr-faint">Reading layers…</p>}
      {read && (
        <div className="st-rig">
          <div className="st-rig__layers">
            <div className="st-row">
              <TextField label="Character name" value={name} onChange={setName} />
            </div>
            <TextField label="Your rights to the artwork" value={rights} onChange={setRights} />
            {read.warnings.length > 0 && <ul className="st-problems">{read.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            {byView.map(([view, layers]) => (
              <section key={view} aria-label={`${VIEW_LABEL[view as View]} layers`}>
                <h3 className="st-h3">{VIEW_LABEL[view as View]} <span className="fr-faint">· {layers.length} layers</span></h3>
                <ul className="st-rig__list">
                  {layers.map((l) => (
                    <li key={l.id} className="st-rig__row">
                      <span className="st-rig__thumb" aria-hidden>{l.media ? <img src={api.mediaUrl(pid, l.media)} alt="" /> : <span className="fr-faint">SVG</span>}</span>
                      <span className="st-rig__name" title={l.group ? `${l.group}/${l.name}` : l.name}>{l.name}{l.hidden && <span className="fr-faint"> · hidden</span>}</span>
                      <span className="st-rig__target"><Select label={`Rig target for ${l.name}`} value={mapping[l.id]} onChange={(v) => setMapping((m) => ({ ...m, [l.id]: v }))} options={read.targets} /></span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="st-rig__side">
            <div className="st-rig__previews">
              {built?.views.map((v, i) => (
                <figure key={v} className="st-builder-view">
                  <canvas ref={(el) => { canvases.current[i] = el; }} role="img" aria-label={`${name}, ${VIEW_LABEL[v]} view`} />
                  <figcaption>{VIEW_LABEL[v]}</figcaption>
                </figure>
              )) ?? <EmptyState title="Preview">Map at least a head layer to see the rigged character.</EmptyState>}
            </div>
            <div className="st-row">
              <span className="fr-faint">Test</span>
              <Chip selected={!gesture} onClick={() => setGesture('')}>Rest</Chip>
              <span className="st-tb-select"><Select label="Test gesture" placeholder="Gesture" value={gesture || undefined} onChange={setGesture} options={(acts ?? []).map((a) => ({ value: a.ref, label: a.name }))} /></span>
            </div>
            <div className="st-field-col">
              <span className="fr-label">Missing mouth shapes</span>
              <Select label="Library mouth" placeholder="Use the drawn mouth shapes" value={libMouth || undefined} onChange={setLibMouth} options={[{ value: '', label: 'Use the drawn mouth shapes' }, ...(mouths ?? []).map((m) => ({ value: m.ref, label: `Library: ${m.name}` }))]} />
              <p className="fr-hint">Speech needs all nine mouth shapes (mouth_A … mouth_H, mouth_X) in every drawn view, or a library mouth.</p>
            </div>
            <div aria-live="polite">
              {built && (errors.length ? <StatusBadge tone="danger">Rig check: {errors.length} problem(s)</StatusBadge> : <StatusBadge tone="success">Rig check passed</StatusBadge>)}
              {problems.length > 0 && <ul className="st-problems" aria-label="Rig check problems">{problems.map((x, i) => <li key={i}><StatusBadge tone={x.severity === 'error' ? 'danger' : 'warning'}>{x.severity === 'error' ? 'Error' : 'Warning'}</StatusBadge> {x.message}</li>)}</ul>}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** A copy of the scene holding only the rigged character, framed full-body. */
function previewState(project: ProjectState, scene: Scene, ref: string, view: View, gesture: string): ProjectState {
  const id = 'ins_rigpreview' as Instance['id'];
  const track = 'trk_rigpreviewact' as Clip['track'];
  const inst: Instance = { id, kind: 'character', asset: ref, name: 'Preview', transform: { x: 960, y: 1000, scale: 1, rotation: 0, flipX: false }, depthPlane: scene.stage.depthPlanes[0]!.id, order: 0, parallax: 1, opacity: 1, visible: true, locked: false, params: {}, character: { look: 'default', view, posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } };
  const clips: Clip[] = gesture ? [{ id: 'clp_rigpreviewact' as Clip['id'], track, start: 0, end: 96000, asset: gesture, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual' }] : [];
  const preview: Scene = { ...scene, instances: [inst], tracks: [{ id: track, kind: 'acting', owner: id, name: 'Acting', mute: false, solo: false, lock: false, hidden: false, gainDb: 0 }], clips, markers: [], cameras: [{ ...scene.cameras[0]!, id: scene.defaultCamera, center: { x: 960, y: 640 }, width: 1000, rotation: 0 }], loop: undefined as never };
  return { ...project, scenes: { ...project.scenes, [scene.id]: preview } };
}
