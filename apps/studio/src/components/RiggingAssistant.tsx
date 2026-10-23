/**
 * Rigging assistant (FR-IMP-03, Design System §7.3): layered artwork → a character. Layers are listed by view with a
 * suggested rig target each (by name convention) that the user can change; a live preview shows the rigged result in
 * every drawn view with a test gesture; mouth shapes the drawing lacks can come from a library mouth; the rig check
 * must pass (view gaps are declared, P11) before the character is saved and placed. The same artwork can instead
 * become a prop with states (layers named `state_on`, `state_off` …) or a location kit whose layers are set pieces
 * on depth planes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateFrame, type ProjectState } from '@frame/core';
import type { AssetManifest, Clip, Instance, Scene, View } from '@frame/schema';
import { Button, Chip, Dialog, EmptyState, Select, StatusBadge, TextField, useToasts, t as tt } from '@frame/ui';
import type { Renderer } from '@frame/render';
import { api } from '../lib/api.js';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { useStudio } from '../lib/store.js';
import { useKind } from './BuilderProperties.js';
import { useCtx } from './Workspace.js';

interface ReadLayer { id: string; name: string; view?: View; group?: string; hidden: boolean; bounds: [number, number, number, number]; media?: string; paths?: unknown[]; suggestion: string; propSuggestion: string; planeSuggestion: string }
interface ReadResult { fileName: string; source: 'psd' | 'svg'; width: number; height: number; views: View[]; layers: ReadLayer[]; warnings: string[]; targets: { value: string; label: string }[]; planes: { value: string; label: string }[] }
interface BuildResult { character: AssetManifest; parts: AssetManifest[]; views: View[]; mouthShapes: string[]; problems: { severity: 'error' | 'warning'; message: string }[]; check: { ok: boolean; problems: { severity: 'error' | 'warning'; message: string }[]; views: string[]; actions: { compatible: number; total: number } }; ok: boolean }

interface ObjectResult { kind: 'prop' | 'set'; asset: AssetManifest; problems: { severity: 'error' | 'warning'; message: string }[]; states: string[] | null; pieces: { key: string; name: string; plane: string; at: [number, number] }[] | null; ok: boolean }
type RigKind = 'character' | 'prop' | 'set';
const KIND_LABEL: Record<RigKind, string> = { character: 'Character', prop: 'Prop with states', set: 'Set' };

const VIEW_LABEL: Record<View, string> = { front: 'Front', three: 'Three-quarter', side: 'Side', back: 'Back' };

export function RiggingAssistant({ file, onClose }: { file: File | undefined; onClose: () => void }) {
  const { studio, assets } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const [read, setRead] = useState<ReadResult>();
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState<RigKind>('character');
  const [maps, setMaps] = useState<Record<RigKind, Record<string, string>>>({ character: {}, prop: {}, set: {} });
  const mapping = maps[kind];
  const setMapping = (f: (m: Record<string, string>) => Record<string, string>) => setMaps((all) => ({ ...all, [kind]: f(all[kind]) }));
  const [extraStates, setExtraStates] = useState<string[]>([]);
  const [newState, setNewState] = useState('');
  const [height, setHeight] = useState('');
  const [object, setObject] = useState<ObjectResult>();
  const [name, setName] = useState('');
  const [rights, setRights] = useState('I made this artwork or own the rights to it');
  const [libMouth, setLibMouth] = useState('');
  const [libHands, setLibHands] = useState('');
  // Joints set by the user per layer (artwork units): limbs turn around `at` and reach `end` (FR-IMP-03).
  const [pivots, setPivots] = useState<Record<string, { at: [number, number]; end?: [number, number] }>>({});
  const [pivotFor, setPivotFor] = useState<string>();
  const [built, setBuilt] = useState<BuildResult>();
  const [busy, setBusy] = useState(false);
  const [gesture, setGesture] = useState('');
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<string, unknown>>();
  const [, setTick] = useState(0);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const mouths = useKind('mouth', pid);
  const handSets = (useKind('base', pid) ?? []).filter((b) => (assets.manifest(b.ref)?.data as { slot?: string } | undefined)?.slot === 'hands');
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
    setObject(undefined);
    setError(undefined);
    if (!file) return;
    setName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    void file.arrayBuffer().then((b) => api.readArtwork(pid, file.name, new Uint8Array(b))).then((r) => {
      const rr = r as ReadResult;
      setRead(rr);
      setMaps({ character: Object.fromEntries(rr.layers.map((l) => [l.id, l.suggestion])), prop: Object.fromEntries(rr.layers.map((l) => [l.id, l.propSuggestion])), set: Object.fromEntries(rr.layers.map((l) => [l.id, l.planeSuggestion])) });
      // A file that looks like a prop or a set opens in that mode.
      const states = rr.layers.filter((l) => l.propSuggestion.startsWith('state:')).length;
      const heads = rr.layers.filter((l) => l.suggestion === 'head').length;
      setKind(heads ? 'character' : states ? 'prop' : rr.width > rr.height * 1.3 ? 'set' : 'prop');
    }).catch((e: Error) => setError(e.message));
  }, [file, pid]);

  const libraryParts = { ...(libMouth ? { mouth: libMouth } : {}), ...(libHands ? { hands: libHands } : {}) };
  const rigExtras = { ...(Object.keys(libraryParts).length ? { libraryParts } : {}), ...(Object.keys(pivots).length ? { pivots } : {}) };
  const layersPayload = useMemo(() => read?.layers.map(({ suggestion: _s, propSuggestion: _p, planeSuggestion: _q, hidden: _h, ...l }) => l), [read]);
  const objectBody = () => ({ kind, name, fileName: read!.fileName, rights, layers: layersPayload, mapping, ...(kind === 'prop' && Number(height) > 0 ? { height: Number(height) } : {}), ...(kind === 'set' ? { width: read!.width, artHeight: read!.height } : {}) });
  // Dry-run build on every change (debounced): manifests for the preview and the rig check.
  useEffect(() => {
    if (!read || !layersPayload || !name.trim()) return;
    if (kind !== 'character') {
      const t = setTimeout(() => {
        api.buildRig(pid, objectBody()).then((r) => setObject(r as ObjectResult)).catch((e: Error) => setError(e.message));
      }, 250);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      api.buildRig(pid, { name, fileName: read.fileName, rights, layers: layersPayload, mapping, ...rigExtras })
        .then((r) => setBuilt(r as BuildResult))
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, layersPayload, mapping, libMouth, libHands, pivots, name, rights, pid, kind, height]);

  // Preview: the rigged draft on a neutral copy of the current scene, in every drawn view.
  const local = useMemo(() => new Map((built ? [...built.parts, built.character] : []).map((m) => [`${m.id}@${m.version}`, m])), [built]);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  useEffect(() => {
    if (!renderer || !styles || !scene || kind === 'character' || !object) return;
    const ref = `${object.asset.id}@1`;
    const resolve = (r: string) => (r === ref ? object.asset : assets.manifest(r));
    const shots = object.kind === 'prop' ? (object.states?.length ? object.states : ['default']) : ['set'];
    shots.forEach((st, i) => {
      const cv = canvases.current[i];
      if (!cv) return;
      const state = objectPreviewState(project, scene, object, st);
      const set = object.kind === 'set';
      const ev = evaluateFrame(state, scene.id, 0, { assets: { manifest: resolve }, styles: styles as never, width: set ? 480 : 240, height: set ? 270 : 320, family: project.project.styleFamily, background: '#00000000' });
      blit(renderer, ev.frame, cv);
    });
  });
  useEffect(() => {
    if (!renderer || !styles || !built || !scene || kind !== 'character') return;
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
    if (kind !== 'character') {
      try {
        const r = (await api.buildRig(pid, { ...objectBody(), save: true, ...(sceneId ? { place: { scene: sceneId } } : {}) })) as { instances: string[] };
        toasts.show({ tone: 'success', message: `${name} is saved as ${kind === 'prop' ? 'a prop' : 'a set'}${sceneId ? ' and placed in the scene' : ''}` });
        if (r.instances.length) studio.set({ selection: r.instances.map((id) => ({ kind: 'instance' as const, id })) });
        onClose();
      } catch (e) {
        toasts.show({ tone: 'error', message: (e as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const r = await api.buildRig(pid, { name, fileName: read.fileName, rights, layers: layersPayload, mapping, ...rigExtras, save: true, ...(sceneId ? { place: { scene: sceneId, x: project.project.output.width / 2, y: project.project.output.height * 0.92 } } : {}) });
      toasts.show({ tone: 'success', message: `${name} is rigged${sceneId ? ' and placed in the scene' : ''}` });
      if ((r as { instance?: string }).instance) studio.set({ selection: [{ kind: 'instance', id: (r as { instance: string }).instance }] });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const problems = kind !== 'character' ? object?.problems ?? [] : built ? [...built.problems, ...built.check.problems] : [];
  const ready = kind === 'character' ? !!built?.ok : !!object?.ok;
  const states = useMemo(() => [...new Set([...Object.values(maps.prop).filter((t) => t.startsWith('state:')).map((t) => t.slice(6)), ...extraStates])], [maps.prop, extraStates]);
  const targetOptions = kind === 'character' ? read?.targets ?? [] : kind === 'set' ? read?.planes ?? [] : [{ value: 'always', label: 'Every state' }, ...states.map((x) => ({ value: `state:${x}`, label: `Only when ${x}` })), { value: 'ignore', label: 'Not used' }];
  const addState = () => {
    const v = newState.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    if (v && !states.includes(v)) setExtraStates((x) => [...x, v]);
    setNewState('');
  };
  const noun = kind === 'character' ? 'character' : kind === 'prop' ? 'prop' : 'set';
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
        <span className="fr-faint st-grow">{kind === 'prop' && object ? `${object.states?.length ? `States: ${object.states.join(', ')}` : 'No states'}` : kind === 'set' && object ? `${object.pieces?.length ?? 0} set pieces` : kind === 'character' && built ? `${built.views.map((v) => VIEW_LABEL[v]).join(', ')} drawn · ${built.mouthShapes.length} of 9 mouth shapes · ${built.check.actions.compatible} compatible actions` : ''}</span>
        <Button onClick={onClose}>{tt('Cancel')}</Button>
        <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!ready || !name.trim()} disabledReason={!name.trim() ? `Name the ${noun}` : 'Fix the problems listed first'}>{tt('Save')} {noun}</Button>
      </>}
    >
      {error && <p role="alert" className="st-error">{error}</p>}
      {!read && !error && <p className="fr-faint">{tt('Reading layers…')}</p>}
      {read && (
        <div className="st-rig">
          <div className="st-rig__layers">
            <div className="st-row" role="group" aria-label={tt('What the artwork is')}>
              {(['character', 'prop', 'set'] as RigKind[]).map((k) => <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}
            </div>
            <div className="st-row">
              <TextField label={`${noun[0]!.toUpperCase()}${noun.slice(1)} name`} value={name} onChange={setName} />
              {kind === 'prop' && <TextField label={tt('Height on stage (px)')} placeholder={String(Math.round(read.height))} value={height} onChange={setHeight} />}
            </div>
            {kind === 'prop' && (
              <div className="st-row">
                <TextField label={tt('New state')} placeholder={tt('e.g. open')} value={newState} onChange={setNewState} onKeyDown={(e) => { if (e.key === 'Enter') addState(); }} />
                <Button onClick={addState} disabled={!newState.trim()} disabledReason={tt('Name the state')}>{tt('Add state')}</Button>
              </div>
            )}
            <TextField label={tt('Your rights to the artwork')} value={rights} onChange={setRights} />
            {read.warnings.length > 0 && <ul className="st-problems">{read.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            {byView.map(([view, layers]) => (
              <section key={view} aria-label={`${VIEW_LABEL[view as View]} layers`}>
                <h3 className="st-h3">{kind === 'character' ? VIEW_LABEL[view as View] : 'Layers'} <span className="fr-faint">· {layers.length}  {tt('layers')}</span></h3>
                <ul className="st-rig__list">
                  {layers.map((l) => (
                    <li key={l.id} className="st-rig__row">
                      <span className="st-rig__thumb" aria-hidden>{l.media ? <img src={api.mediaUrl(pid, l.media)} alt="" /> : <span className="fr-faint">{tt('SVG')}</span>}</span>
                      <span className="st-rig__name" title={l.group ? `${l.group}/${l.name}` : l.name}>{l.name}{l.hidden && <span className="fr-faint">  {tt('· hidden')}</span>}</span>
                      <span className="st-rig__target"><Select label={`${kind === 'set' ? 'Depth plane' : kind === 'prop' ? 'State' : 'Rig target'} for ${l.name}`} value={mapping[l.id]} onChange={(v) => setMapping((m) => ({ ...m, [l.id]: v }))} options={targetOptions} /></span>
                      {kind === 'character' && JOINTED.test(mapping[l.id] ?? '') && <Button onClick={() => setPivotFor(l.id)} aria-label={`Set the joint of ${l.name}`}>{pivots[l.id] ? 'Joint set' : 'Joint…'}</Button>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="st-rig__side">
            {kind !== 'character' ? (
              <div className="st-rig__previews">
                {object ? (object.kind === 'prop' ? (object.states?.length ? object.states : ['default']) : ['set']).map((st, i) => (
                  <figure key={st} className="st-builder-view">
                    <canvas ref={(el) => { canvases.current[i] = el; }} role="img" aria-label={object.kind === 'set' ? `${name} set` : `${name}${st === 'default' ? '' : `, ${st}`}`} />
                    <figcaption>{object.kind === 'set' ? 'Set' : st === 'default' ? 'As drawn' : st}</figcaption>
                  </figure>
                )) : <EmptyState title={tt('Preview')}>{tt('Map at least one layer to see the')} {noun}.</EmptyState>}
              </div>
            ) : (<>
            <div className="st-rig__previews">
              {built?.views.map((v, i) => (
                <figure key={v} className="st-builder-view">
                  <canvas ref={(el) => { canvases.current[i] = el; }} role="img" aria-label={`${name}, ${VIEW_LABEL[v]} view`} />
                  <figcaption>{VIEW_LABEL[v]}</figcaption>
                </figure>
              )) ?? <EmptyState title={tt('Preview')}>{tt('Map at least a head layer to see the rigged character.')}</EmptyState>}
            </div>
            <div className="st-row">
              <span className="fr-faint">{tt('Test')}</span>
              <Chip selected={!gesture} onClick={() => setGesture('')}>{tt('Rest')}</Chip>
              <span className="st-tb-select"><Select label={tt('Test gesture')} placeholder={tt('Gesture')} value={gesture || undefined} onChange={setGesture} options={(acts ?? []).map((a) => ({ value: a.ref, label: a.name }))} /></span>
            </div>
            <div className="st-field-col">
              <span className="fr-label">{tt('Missing mouth shapes')}</span>
              <Select label={tt('Library mouth')} placeholder={tt('Use the drawn mouth shapes')} value={libMouth || undefined} onChange={setLibMouth} options={[{ value: '', label: 'Use the drawn mouth shapes' }, ...(mouths ?? []).map((m) => ({ value: m.ref, label: `Library: ${m.name}` }))]} />
              <p className="fr-hint">{tt('Speech needs all nine mouth shapes (mouth_A … mouth_H, mouth_X) in every drawn view, or a library mouth.')}</p>
            </div>
            <div className="st-field-col">
              <span className="fr-label">{tt('Hand poses')}</span>
              <Select label={tt('Library hands')} placeholder={tt('Use the drawn hands')} value={libHands || undefined} onChange={setLibHands} options={[{ value: '', label: 'Use the drawn hands' }, ...handSets.map((m) => ({ value: m.ref, label: `Library: ${m.name}` }))]} />
              <p className="fr-hint">{tt('Drawn hands keep the pose they are drawn in; a library hand set gives pointing, fists and every other hand pose.')}</p>
            </div>
            </>)}
            <div aria-live="polite">
              {(kind === 'character' ? built : object) && (errors.length ? <StatusBadge tone="danger">{tt('Rig check:')} {errors.length}  {tt('problem(s)')}</StatusBadge> : <StatusBadge tone="success">{tt('Rig check passed')}</StatusBadge>)}
              {problems.length > 0 && <ul className="st-problems" aria-label={tt('Rig check problems')}>{problems.map((x, i) => <li key={i}><StatusBadge tone={x.severity === 'error' ? 'danger' : 'warning'}>{x.severity === 'error' ? 'Error' : 'Warning'}</StatusBadge> {x.message}</li>)}</ul>}
            </div>
          </div>
        </div>
      )}
      {pivotFor && read && <JointEditor layer={read.layers.find((l) => l.id === pivotFor)!} pid={pid} limb={/arm|thigh|shin/.test(mapping[pivotFor] ?? '')} value={pivots[pivotFor]} onClose={() => setPivotFor(undefined)} onChange={(v) => setPivots((p) => { const n = { ...p }; if (v) n[pivotFor] = v; else delete n[pivotFor]; return n; })} />}
    </Dialog>
  );
}

const JOINTED = /^(upper_arm|forearm|hand|thigh|shin|foot)_[LR]$/;

/**
 * Joint editor (FR-IMP-03 pivots): click the layer to put the joint it turns around (shoulder, elbow, hip, knee,
 * wrist, ankle); for an arm or leg segment, Shift-click puts the far joint. Numbers can be typed too.
 */
function JointEditor({ layer, pid, limb, value, onChange, onClose }: { layer: ReadLayer; pid: string; limb: boolean; value?: { at: [number, number]; end?: [number, number] }; onChange: (v: { at: [number, number]; end?: [number, number] } | undefined) => void; onClose: () => void }) {
  const [x, y, w, h] = layer.bounds;
  const scale = Math.min(320 / w, 320 / h, 4);
  const at = value?.at ?? [x + w / 2, y];
  const end = value?.end ?? [x + w / 2, y + h];
  const set = (k: 'at' | 'end', p: [number, number]) => onChange({ at: k === 'at' ? p : at, ...(limb ? { end: k === 'end' ? p : end } : {}) });
  const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : d);
  return (
    <Dialog title={`Joint · ${layer.name}`} open onClose={onClose} footer={<><Button onClick={() => { onChange(undefined); onClose(); }}>{tt('Reset')}</Button><Button variant="primary" onClick={onClose}>{tt('Done')}</Button></>}>
      <div className="st-row" style={{ alignItems: 'flex-start' }}>
        <svg width={w * scale} height={h * scale} viewBox={`${x} ${y} ${w} ${h}`} className="st-joint" role="img" aria-label={`${layer.name} with its joint${limb ? 's' : ''}`}
          onClick={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const p: [number, number] = [Math.round(x + (e.clientX - r.left) / scale), Math.round(y + (e.clientY - r.top) / scale)];
            set(e.shiftKey && limb ? 'end' : 'at', p);
          }}>
          {layer.media ? <image href={api.mediaUrl(pid, layer.media)} x={x} y={y} width={w} height={h} /> : <rect x={x} y={y} width={w} height={h} fill="var(--color-subtle)" />}
          <circle cx={at[0]} cy={at[1]} r={4 / scale} fill="var(--color-accent)" />
          {limb && <><line x1={at[0]} y1={at[1]} x2={end[0]} y2={end[1]} stroke="var(--color-accent)" strokeWidth={1.5 / scale} /><circle cx={end[0]} cy={end[1]} r={4 / scale} fill="none" stroke="var(--color-accent)" strokeWidth={1.5 / scale} /></>}
        </svg>
        <div className="st-field-col">
          <TextField label={tt('Joint x')} value={String(at[0])} onChange={(v) => set('at', [num(v, at[0]), at[1]])} />
          <TextField label={tt('Joint y')} value={String(at[1])} onChange={(v) => set('at', [at[0], num(v, at[1])])} />
          {limb && <TextField label={tt('Far joint y')} value={String(end[1])} onChange={(v) => set('end', [end[0], num(v, end[1])])} />}
          <p className="fr-hint">{tt('Click to place the joint this layer turns around')}{limb ? '; Shift-click places the far joint (elbow, wrist, knee or ankle)' : ''}{tt('. Units are artwork pixels.')}</p>
        </div>
      </div>
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

/** A copy of the scene holding only the rigged prop (in one state) or the set's pieces. */
function objectPreviewState(project: ProjectState, scene: Scene, o: ObjectResult, propState: string): ProjectState {
  const ref = `${o.asset.id}@1`;
  const base = { scale: 1, rotation: 0, flipX: false };
  const common = { asset: ref, order: 0, parallax: 1, opacity: 1, visible: true, locked: false } as const;
  const planes = new Set(scene.stage.depthPlanes.map((d) => d.id));
  const instances: Instance[] = o.kind === 'prop'
    ? [{ ...common, id: 'ins_rigpreview' as Instance['id'], kind: 'prop', name: 'Preview', transform: { x: 960, y: 1000, ...base }, depthPlane: scene.stage.depthPlanes[0]!.id, params: {}, ...(propState !== 'default' ? { propState } : {}) } as Instance]
    : (o.pieces ?? []).map((p, i) => ({ ...common, id: `ins_rigpreview${i}` as Instance['id'], kind: 'set-piece', name: p.name, order: i, transform: { x: p.at[0], y: p.at[1], ...base }, depthPlane: planes.has(p.plane) ? p.plane : scene.stage.depthPlanes[0]!.id, params: { part: p.key } }) as Instance);
  const out = project.project.output;
  const cam = o.kind === 'prop'
    ? { center: { x: 960, y: 1000 - Number((o.asset.anchors as { bounds?: number[] }).bounds?.[3] ?? 400) / 2 }, width: Math.max(400, Number((o.asset.anchors as { bounds?: number[] }).bounds?.[3] ?? 400) * 1.4) }
    : { center: { x: out.width / 2, y: out.height / 2 }, width: out.width };
  const preview: Scene = { ...scene, instances, tracks: [], clips: [], markers: [], cameras: [{ ...scene.cameras[0]!, id: scene.defaultCamera, ...cam, rotation: 0 }], loop: undefined as never };
  return { ...project, scenes: { ...project.scenes, [scene.id]: preview } };
}
