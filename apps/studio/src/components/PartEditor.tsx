/**
 * Part editor (SRS §8.2, FR-PED-01..05): edits a part's vector geometry per view and family — control points
 * (drag, add, delete), parameter bindings (drag with a parameter away from rest), fills, strokes, layering slots and
 * fit spaces, anchors — with onion-skin of other views, mirror and copy-view tools, a family-conversion draft, the
 * live rig check, and an on-character preview through the export renderer. Saving makes a new part from a library
 * part or a new version of a project part; a part that fails the rig check can only be saved as a draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowLeft, FlipHorizontal2, Moon, Plus, Redo2, Sun, Trash2, Undo2 } from 'lucide-react';
import { previewFrame, previewSetup } from '@frame/core';
import {
  SLOT_ORDER, buildPalette, buildPath, convertFamily, ellipsePath, evalPoint, mirrorView, movePoint, newPointName, resolveColor, resolveFill, rigCheck, usedPoints,
  type FamilyArt, type FamilyStyle, type FitSpace, type LayerDef, type PartData, type Seg, type ShapeDef, type ViewArt,
} from '@frame/rig';
import type { AssetManifest, StyleFamily, View } from '@frame/schema';
import type { Item, Renderer } from '@frame/render';
import {
  AppBar, Breadcrumb, Button, EmptyState, IconButton, NumberField, Panel, SearchField, Section, Segmented, Select, SliderRow, StatusBadge, TextField, Toolbar,
  ToolbarSeparator, Tree, useTheme, useToasts, VSep, type TreeNode, t as tt } from '@frame/ui';
import { api } from '../lib/api.js';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

const VIEWS: { value: View; label: string }[] = [{ value: 'front', label: 'Front' }, { value: 'three', label: '¾' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }];
const SPACES: FitSpace[] = ['head', 'face', 'neck', 'torso', 'pelvis', 'eye', 'eyeL', 'eyeR', 'brow', 'browL', 'browR', 'mouth', 'nose', 'ear', 'earL', 'earR', 'hand', 'handL', 'handR', 'foot', 'footL', 'footR', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'thighL', 'thighR', 'shinL', 'shinR', 'stage'];
const SIZE = 560;
/** Colours for palette slots in the editor (a neutral sample character); parts may declare their own defaults. */
const SAMPLE_COLORS: Record<string, string> = { skin: '#D9A47E', hair: '#3A2A20', eye: '#3B2A20', lip: '#B5636A', brow: '#2E211A', top: '#3F5F8F', bottom: '#3E5953', outer: '#7B5EA8', dress: '#A33F55', shoe: '#2B2D33', acc: '#D9A441', garment: '#3F5F8F' };

type Tool = 'select' | 'add';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function PartEditor({ partRef }: { partRef: string }) {
  const { studio, assets } = useCtx();
  const toasts = useToasts();
  const { resolved, setTheme } = useTheme();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const [editing, setEditing] = useState(partRef);
  const [base, setBase] = useState<AssetManifest>();
  const [name, setName] = useState('');
  const [data, setData] = useState<PartData>();
  const [saved, setSaved] = useState<string>();
  const [undo, setUndo] = useState<PartData[]>([]);
  const [redo, setRedo] = useState<PartData[]>([]);
  const pending = useRef<PartData | null>(null);
  const [family, setFamily] = useState<StyleFamily>(project.project.styleFamily);
  const [view, setView] = useState<View>('front');
  const [layerIx, setLayerIx] = useState(0);
  const [shapeIx, setShapeIx] = useState(0);
  const [point, setPoint] = useState<string>();
  const [params, setParams] = useState<Record<string, number>>({});
  const [binding, setBinding] = useState<string>();
  const [onion, setOnion] = useState(true);
  const [tool, setTool] = useState<Tool>('select');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(new Set<string>(['views', 'view:front']));
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<StyleFamily, FamilyStyle>>();
  const [previewChar, setPreviewChar] = useState<{ ref: string; manifest: AssetManifest }>();
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onChar = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    void getRenderer().then(setRenderer);
    void getStyles().then((s) => setStyles(s as never));
    void api.libraryDefaults().then(async (d) => {
      if (!d.previewCharacter) return;
      const m = (await api.manifest(d.previewCharacter, pid)) as AssetManifest;
      setPreviewChar({ ref: d.previewCharacter, manifest: m });
    }).catch(() => undefined);
    const off = assets.onChange(() => setTick((t) => t + 1));
    return () => {
      off();
    };
  }, [assets, pid]);

  useEffect(() => {
    let live = true;
    api.manifest(editing, pid).then((m) => {
      if (!live) return;
      const man = m as AssetManifest;
      setBase(man);
      setName(editing === partRef && !man.id.startsWith('user.') ? `${man.name} (custom)` : man.name);
      setData(clone(man.data as PartData));
      setSaved(JSON.stringify(man.data));
      setUndo([]);
      setRedo([]);
    }).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
    return () => {
      live = false;
    };
  }, [editing, pid, partRef, toasts]);

  const dirty = !!data && JSON.stringify(data) !== saved;
  const edit = useCallback((fn: (d: PartData) => void, phase: 'preview' | 'commit' = 'commit') => {
    setData((cur) => {
      if (!cur) return cur;
      if (phase === 'preview' && !pending.current) pending.current = cur;
      const next = clone(cur);
      fn(next);
      if (phase === 'commit') {
        const before = pending.current ?? cur;
        pending.current = null;
        if (JSON.stringify(before) !== JSON.stringify(next)) {
          setUndo((u) => [...u.slice(-199), before]);
          setRedo([]);
        }
      }
      return next;
    });
  }, []);
  const doUndo = () => {
    if (!undo.length || !data) return;
    setRedo((r) => [...r, data]);
    setData(undo.at(-1));
    setUndo((u) => u.slice(0, -1));
  };
  const doRedo = () => {
    if (!redo.length || !data) return;
    setUndo((u) => [...u, data]);
    setData(redo.at(-1));
    setRedo((r) => r.slice(0, -1));
  };

  const fam: FamilyArt | undefined = data?.families[family];
  const art: ViewArt | undefined = fam?.views[view];
  const layer: LayerDef | undefined = art?.layers[layerIx];
  const shape: ShapeDef | undefined = layer?.shapes?.[shapeIx];
  const space = (layer?.space ?? 'head') as FitSpace;
  const issues = useMemo(() => (data ? rigCheck(data) : []), [data]);
  const errors = issues.filter((i) => i.severity === 'error');

  // Parameters the view's points respond to (part parameters and character controls), scrubbed −1…1.
  const paramKeys = useMemo(() => {
    const keys = new Set<string>((data?.params ?? []).map((p) => p.key));
    for (const mp of Object.values(art?.points ?? {})) for (const k of Object.keys(mp.d ?? {})) keys.add(k);
    return [...keys].sort();
  }, [data, art]);

  // Fit-space → canvas mapping that frames the selected layer's points (and the space's unit guides).
  const frame = useMemo(() => {
    const pts: [number, number][] = space === 'torso' || space === 'pelvis' ? [[-1, 0], [1, 1]] : space.startsWith('upper') || space.startsWith('fore') || space.startsWith('thigh') || space.startsWith('shin') ? [[-1, 0], [1, 1]] : [[-1, -1], [1, 1]];
    for (const l of art?.layers ?? []) {
      if ((l.space ?? 'head') !== space) continue;
      for (const s of l.shapes ?? []) {
        for (const seg of s.path ?? []) for (const r of seg.slice(1) as string[]) if (art!.points[r]) pts.push(evalPoint(art!.points[r]!, params));
        if (s.art) pts.push([s.art.box[0], s.art.box[1]], [s.art.box[2], s.art.box[3]]);
      }
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const S = (SIZE * 0.8) / Math.max(x1 - x0, y1 - y0, 0.2);
    const ox = SIZE / 2 - ((x0 + x1) / 2) * S;
    const oy = SIZE / 2 - ((y0 + y1) / 2) * S;
    return { S, ox, oy, map: (u: number, v: number): [number, number] => [ox + u * S, oy + v * S], inv: (x: number, y: number): [number, number] => [(x - ox) / S, (y - oy) / S] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, view, family, layerIx, data === undefined]);

  // Draw the view in fit space through the shared renderer.
  useEffect(() => {
    if (!renderer || !styles || !data || !canvas.current) return;
    const style = styles[family];
    const palette = buildPalette({ ...SAMPLE_COLORS, ...(data.colors ?? {}) }, style);
    const items: Item[] = [];
    const draw = (a: ViewArt, op: number, outline: boolean) => {
      for (const l of a.layers) {
        if ((l.space ?? 'head') !== space || l.limb) continue;
        for (const s of l.shapes ?? []) {
          const at = (n: string) => frame.map(...(a.points[n] ? evalPoint(a.points[n]!, params) : [0, 0]) as [number, number]);
          if (s.art) {
            const [u0, v0, u1, v1] = s.art.box;
            const p0 = frame.map(u0, v0);
            const p1 = frame.map(u1, v1);
            items.push({ k: 'rect', x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]), stroke: { paint: { color: '#4F7CFF' }, width: 1 }, op });
            continue;
          }
          const d = s.path ? buildPath(s.path, a.points, params, frame.map, () => undefined) : s.ellipse ? ellipsePath(s.ellipse, a.points, params, frame.map, () => undefined) : '';
          if (!d) continue;
          if (outline) items.push({ k: 'path', d, stroke: { paint: { color: '#8F8F95' }, width: 1 }, op });
          else items.push({ k: 'path', d, ...(s.fill ? { fill: resolveFill(s.fill, palette, at) } : {}), ...(s.stroke ? { stroke: { paint: { color: resolveColor(s.stroke.c, palette) }, width: Math.max(0.5, s.stroke.w * frame.S / 60) } } : {}), op: op * (s.opacity ?? 1), ...(s.evenOdd ? { evenOdd: true } : {}) });
        }
      }
    };
    if (onion) for (const v of VIEWS) if (v.value !== view && fam?.views[v.value]) draw(fam.views[v.value]!, 0.35, true);
    if (art) draw(art, 1, false);
    // Unit guides of the fit space.
    const g0 = frame.map(-1, space === 'torso' || space === 'pelvis' || /^(upper|fore|thigh|shin)/.test(space) ? 0 : -1);
    const g1 = frame.map(1, 1);
    items.unshift({ k: 'rect', x: g0[0], y: g0[1], w: g1[0] - g0[0], h: g1[1] - g0[1], stroke: { paint: { color: '#5A5A60' }, width: 1 } });
    const c0 = frame.map(0, 0);
    items.unshift({ k: 'path', d: `M${c0[0] - 8} ${c0[1]}H${c0[0] + 8}M${c0[0]} ${c0[1] - 8}V${c0[1] + 8}`, stroke: { paint: { color: '#5A5A60' }, width: 1 } });
    blit(renderer, { width: SIZE, height: SIZE, background: '#00000000', items }, canvas.current);
  });

  // The part on the library's preview character, through the scene evaluation and export renderer.
  useEffect(() => {
    if (!renderer || !styles || !data || !base || !previewChar || !onChar.current) return;
    const draft = { ...base, name, data } as AssetManifest;
    const setup = previewSetup(editing, draft, previewChar);
    if (!setup) return;
    const resolve = (r: string) => setup.state.assets[r] ?? (r === editing ? draft : r === previewChar.ref ? previewChar.manifest : assets.manifest(r));
    // Show the edited view (the setup state is frozen: build a copy with the view changed).
    const sc = setup.state.scenes[setup.scene]!;
    const viewed = { ...setup, state: { ...setup.state, scenes: { ...setup.state.scenes, [setup.scene]: { ...sc, instances: sc.instances.map((i) => (i.id === setup.subject && i.character ? { ...i, character: { ...i.character, view } } : i)) } } } };
    const ev = previewFrame(viewed, { assets: { manifest: resolve }, styles: styles as never, width: 220, height: 300, family, background: '#00000000' });
    blit(renderer, ev.frame, onChar.current);
  });

  // Point dragging and adding (pen).
  const drag = useRef<string | null>(null);
  const toFit = (e: RPointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return frame.inv(((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE);
  };
  const updateArt = (fn: (a: ViewArt) => void, phase: 'preview' | 'commit' = 'commit') => edit((d) => fn(d.families[family]!.views[view]!), phase);
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!art || !shape) return;
    const [u, v] = toFit(e);
    if (tool === 'add' && shape.path) {
      const nm = newPointName(art);
      updateArt((a) => {
        a.points[nm] = { p: [Math.round(u * 1000) / 1000, Math.round(v * 1000) / 1000] };
        const path = a.layers[layerIx]!.shapes![shapeIx]!.path!;
        const z = path.findIndex((s) => s[0] === 'Z');
        path.splice(z < 0 ? path.length : z, 0, ['L', nm]);
      });
      setPoint(nm);
    }
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current || !art) return;
    const name = drag.current;
    const target = toFit(e);
    updateArt((a) => { a.points[name] = movePoint(a.points[name]!, params, target, binding); }, 'preview');
  };
  const onUp = () => {
    if (drag.current) edit(() => undefined, 'commit');
    drag.current = null;
  };

  const save = async (draft: boolean, asNew: boolean) => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api.savePart(pid, { from: editing, name, data, draft, asNew });
      toasts.show({ tone: r.draft ? 'warning' : 'success', message: r.draft ? `Saved ${name} as a draft; it cannot be used until it passes the rig check` : `Saved ${name}${r.isNew ? ' as a new part' : ''}` });
      setEditing(r.ref);
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm('Leave the part editor? Unsaved changes to this part will be lost.')) return;
    history.back();
  };

  if (!data || !base) return <div className="fr-root st-app st-center" aria-busy="true">{tt('Loading part…')}</div>;
  const library = !editing.startsWith('user.');
  const versionN = Number(editing.split('@')[1] ?? 1);
  const shapePoints = new Set<string>();
  for (const seg of shape?.path ?? []) for (const r of seg.slice(1) as string[]) shapePoints.add(r);
  if (shape?.ellipse) shapePoints.add(shape.ellipse.c);
  const nodes = partTree(data, family, q);
  const sel = `shape:${view}:${layerIx}:${shapeIx}`;
  const sec = (k: string) => sections[k] ?? true;
  const tog = (k: string, o: boolean) => setSections((s) => ({ ...s, [k]: o }));
  const other: StyleFamily = family === 'flat' ? 'illustrated' : 'flat';

  return (
    <div className="fr-root st-app st-builder st-parted">
      <AppBar
        left={<>
          <IconButton label={tt('Back')} icon={<ArrowLeft size={16} />} onClick={back} />
          <VSep />
          <Breadcrumb items={[{ label: 'Parts', onClick: back }, { label: name || base.name }]} />
          <StatusBadge tone={dirty ? 'warning' : 'neutral'}>{library ? 'Library part' : `v${versionN}`}{dirty ? ' · edited' : ''}</StatusBadge>
        </>}
        right={<>
          <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />
          <IconButton label={tt('Undo')} icon={<Undo2 size={16} />} onClick={doUndo} disabled={!undo.length} disabledReason={tt('Nothing to undo')} />
          <IconButton label={tt('Redo')} icon={<Redo2 size={16} />} onClick={doRedo} disabled={!redo.length} disabledReason={tt('Nothing to redo')} />
          <Button disabled disabledReason={tt('Drafting from a description needs a configured drawing model (Settings → Assistance); none is configured')}>{tt('Draft from description…')}</Button>
          <Button onClick={() => void save(true, library)} disabled={!dirty || busy} disabledReason={busy ? 'Saving…' : 'No changes'}>{tt('Save as draft')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save(false, library)} disabled={!dirty || errors.length > 0} disabledReason={!dirty ? 'No changes to save' : 'Fix the rig check problems, or save as a draft'}>{library ? 'Save as new part' : `Save version ${versionN + 1}`}</Button>
        </>}
      />
      <div className="st-main">
        <Panel title={tt('Part')} label={tt('Part layers')} help="#/help/builder" search={<SearchField label={tt('Search layers')} placeholder={tt('Search layers')} value={q} onChange={setQ} />} className="st-left">
          <Tree label={tt('Views and layers')} nodes={nodes} expanded={expanded} onExpandedChange={setExpanded} selected={sel} query={q} emptyText={tt('No layers')} onSelect={(id) => {
            const [kind, v, l, s] = id.split(':');
            if (kind === 'view') setView(v as View);
            if (kind === 'layer' || kind === 'shape') {
              setView(v as View);
              setLayerIx(Number(l));
              setShapeIx(kind === 'shape' ? Number(s) : 0);
              setPoint(undefined);
            }
          }} />
          <div className="st-panel-foot st-rigcheck">
            <StatusBadge tone={errors.length ? 'danger' : issues.length ? 'warning' : 'success'}>{errors.length ? `Rig check: ${errors.length} problem(s)` : 'Rig check passed'}</StatusBadge>
          </div>
        </Panel>
        <div className="st-center-col">
          <Toolbar label={tt('Editing tools')}>
            <span className="fr-faint">{tt('Tool')}</span>
            <Segmented label={tt('Tool')} value={tool} onChange={setTool} options={[{ value: 'select', label: 'Select' }, { value: 'add', label: 'Pen' }]} />
            <ToolbarSeparator />
            <Button icon={<FlipHorizontal2 size={14} />} onClick={() => art && updateArt((a) => Object.assign(a, mirrorView(a)))} disabled={!art} disabledReason={tt('This view is not drawn')}>{tt('Mirror view')}</Button>
            <Button onClick={() => setOnion(!onion)} aria-pressed={onion}>{tt('Onion skin')}</Button>
            <ToolbarSeparator />
            <span className="fr-faint">{tt('Binding')}</span>
            <span className="st-tb-select"><Select label={tt('Draw a parameter binding')} placeholder={tt('Base shape')} value={binding} onChange={(v) => setBinding(v === '' ? undefined : v)} options={[{ value: '', label: 'Base shape' }, ...paramKeys.map((k) => ({ value: k, label: k }))]} /></span>
          </Toolbar>
          <div className="st-parted__canvas">
            {art ? (
              <div className="st-parted__stage" style={{ width: SIZE, height: SIZE }}>
                <canvas ref={canvas} width={SIZE} height={SIZE} role="img" aria-label={`${name}, ${view} view, ${family} artwork in ${space} space`} />
                <svg className="st-parted__overlay" viewBox={`0 0 ${SIZE} ${SIZE}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} aria-label={tt('Control points')}>
                  {Object.entries(art.points).filter(([n]) => shapePoints.has(n)).map(([n, mp]) => {
                    const [x, y] = frame.map(...evalPoint(mp, params));
                    return (
                      <circle
                        key={n} cx={x} cy={y} r={n === point ? 6 : 4.5} className={`st-pt ${n === point ? 'st-pt--sel' : ''}`} tabIndex={0} role="button" aria-label={`Point ${n}`}
                        onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); drag.current = n; setPoint(n); }}
                        onKeyDown={(e) => {
                          const step = e.shiftKey ? 0.05 : 0.01;
                          const dv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                          const d = dv[e.key];
                          if (!d) return;
                          e.preventDefault();
                          const [u, v] = evalPoint(mp, params);
                          updateArt((a) => { a.points[n] = movePoint(a.points[n]!, params, [u + d[0], v + d[1]], binding); });
                        }}
                        onFocus={() => setPoint(n)}
                      />
                    );
                  })}
                </svg>
              </div>
            ) : (
              <EmptyState title={`No ${VIEWS.find((v) => v.value === view)!.label} view`} action={<div className="st-buttons">
                {VIEWS.filter((v) => fam?.views[v.value]).map((v) => <Button key={v.value} onClick={() => edit((d) => { d.families[family]!.views[view] = clone(d.families[family]!.views[v.value]!); delete d.families[family]!.exempt?.[view]; })}>{tt('Copy from')} {v.label}</Button>)}
              </div>}>{fam?.exempt?.[view] ? `Declared exempt: ${fam.exempt[view]}` : 'Copy another view as a starting point, or declare the view exempt with a reason.'}</EmptyState>
            )}
            <figure className="st-parted__onchar">
              <canvas ref={onChar} width={220} height={300} role="img" aria-label={`${name} on the preview character, ${view} view`} />
              <figcaption className="fr-faint">{tt('On character')}</figcaption>
            </figure>
          </div>
          <Toolbar label={tt('Views and family')}>
            <span className="fr-faint">{tt('View')}</span>
            <Segmented label={tt('View')} value={view} onChange={(v) => { setView(v); setPoint(undefined); }} options={VIEWS.map((v) => ({ ...v, label: `${v.label}${fam?.views[v.value] ? '' : fam?.exempt?.[v.value] ? ' (exempt)' : ' (missing)'}` }))} />
            <ToolbarSeparator />
            <span className="fr-faint">{tt('Family')}</span>
            <Segmented label={tt('Style family')} value={family} onChange={setFamily} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
            <Button onClick={() => edit((d) => { d.families[family] = convertFamily(d.families[other]!, family); })} disabled={!data.families[other]} disabledReason={`No ${other} artwork to draft from`}>{tt('Draft')} {family}  {tt('from')} {other}</Button>
          </Toolbar>
        </div>
        <Panel title={layer ? `Layer · ${layer.slot}` : 'Part'} label={tt('Part properties')} help="#/help/builder" className="st-right">
          <div className="st-props">
            <Section title={tt('Part')} open={sec('part')} onToggle={(o) => tog('part', o)}>
              <TextField label={tt('Part name')} value={name} onChange={setName} />
              <div className="st-kv"><span className="fr-faint">{tt('Rig category')}</span><span>{data.slot}</span></div>
              <div className="st-kv"><span className="fr-faint">{tt('Based on')}</span><span className="fr-mono">{partRef}</span></div>
            </Section>
            {layer && (
              <Section title={tt('Layer')} summary={layer.space ?? 'head'} open={sec('layer')} onToggle={(o) => tog('layer', o)}>
                <span className="fr-label">{tt('Layering slot')}</span>
                <Select label={tt('Layering slot')} value={layer.slot} onChange={(v) => updateArt((a) => { a.layers[layerIx]!.slot = v; })} options={[...SLOT_ORDER.map((s) => ({ value: s, label: s })), ...['arm.*', 'hand.*', 'leg.*', 'foot.*', 'sleeve.*', 'shoe.*', 'legwear.*'].map((s) => ({ value: s, label: `${s} (near/far)` }))]} />
                <span className="fr-label">{tt('Fit space')}</span>
                <Select label={tt('Fit space')} value={(layer.space ?? 'head') as string} onChange={(v) => updateArt((a) => { a.layers[layerIx]!.space = v as FitSpace; })} options={SPACES.map((s) => ({ value: s, label: s }))} />
                <div className="st-buttons">
                  <Button icon={<Plus size={14} />} onClick={() => updateArt((a) => { const nm = newPointName(a); a.points[nm] = { p: [-0.3, -0.3] }; a.points[`${nm}b`] = { p: [0.3, -0.3] }; a.points[`${nm}c`] = { p: [0, 0.3] }; a.layers[layerIx]!.shapes = [...(a.layers[layerIx]!.shapes ?? []), { path: [['M', nm], ['L', `${nm}b`], ['L', `${nm}c`], ['Z']], fill: data.colorSlot ? 'garment' : 'skin' }]; })}>{tt('Add shape')}</Button>
                  <Button icon={<Plus size={14} />} onClick={() => updateArt((a) => { a.layers.push({ slot: layer.slot, space: layer.space ?? 'head', shapes: [] }); })}>{tt('Add layer')}</Button>
                  <Button icon={<Trash2 size={14} />} onClick={() => { updateArt((a) => { a.layers.splice(layerIx, 1); }); setLayerIx(0); setShapeIx(0); }} disabled={art!.layers.length < 2} disabledReason={tt('A view keeps at least one layer')}>{tt('Delete layer')}</Button>
                </div>
              </Section>
            )}
            {shape && (
              <Section title={tt('Shape')} summary={shape.id ?? `#${shapeIx + 1}`} open={sec('shape')} onToggle={(o) => tog('shape', o)}>
                {shape.art ? <p className="fr-hint">{tt('Placed artwork (imported). Its box in fit space:')} {shape.art.box.map((n) => n.toFixed(2)).join(', ')}.</p> : <>
                  <span className="fr-label">{tt('Fill (palette slot or #hex)')}</span>
                  <TextField label={tt('Fill (palette slot or #hex)')} value={typeof shape.fill === 'string' ? shape.fill : shape.fill ? 'gradient' : ''} onChange={(v) => updateArt((a) => { const s = a.layers[layerIx]!.shapes![shapeIx]!; if (v) s.fill = v; else delete s.fill; }, 'preview')} onBlur={() => edit(() => undefined)} />
                  <span className="fr-label">{tt('Stroke colour (empty for none)')}</span>
                  <TextField label={tt('Stroke colour')} value={shape.stroke?.c ?? ''} onChange={(v) => updateArt((a) => { const s = a.layers[layerIx]!.shapes![shapeIx]!; if (v) s.stroke = { c: v, w: s.stroke?.w ?? 1, cap: s.stroke?.cap ?? 'round' }; else delete s.stroke; }, 'preview')} onBlur={() => edit(() => undefined)} />
                  {shape.stroke && <SliderRow label={tt('Line weight')} value={shape.stroke.w} min={0} max={6} step={0.1} defaultValue={1} format={(v) => v.toFixed(1)} onChange={(v, phase) => updateArt((a) => { a.layers[layerIx]!.shapes![shapeIx]!.stroke!.w = v; }, phase)} />}
                  <SliderRow label={tt('Opacity')} value={Math.round((shape.opacity ?? 1) * 100)} min={0} max={100} defaultValue={100} format={(v) => `${v}%`} onChange={(v, phase) => updateArt((a) => { const s = a.layers[layerIx]!.shapes![shapeIx]!; if (v >= 100) delete s.opacity; else s.opacity = v / 100; }, phase)} />
                  <span className="fr-label">{tt('Blend')}</span>
                  <Select label={tt('Blend')} value={shape.blend ?? 'normal'} onChange={(v) => updateArt((a) => { const s = a.layers[layerIx]!.shapes![shapeIx]!; if (v === 'normal') delete s.blend; else s.blend = v as ShapeDef['blend']; })} options={['normal', 'multiply', 'screen', 'overlay', 'soft-light'].map((b) => ({ value: b, label: b }))} />
                  <Button icon={<Trash2 size={14} />} onClick={() => { updateArt((a) => { a.layers[layerIx]!.shapes!.splice(shapeIx, 1); }); setShapeIx(0); }}>{tt('Delete shape')}</Button>
                </>}
              </Section>
            )}
            {point && art?.points[point] && (
              <Section title={tt('Point')} summary={point} open={sec('point')} onToggle={(o) => tog('point', o)}>
                <div className="st-grid2">
                  <NumberField label="u" value={art.points[point]!.p[0]} step={0.01} precision={3} onChange={(v) => updateArt((a) => { a.points[point]!.p = [v, a.points[point]!.p[1]]; })} />
                  <NumberField label="v" value={art.points[point]!.p[1]} step={0.01} precision={3} onChange={(v) => updateArt((a) => { a.points[point]!.p = [a.points[point]!.p[0], v]; })} />
                </div>
                {Object.entries(art.points[point]!.d ?? {}).map(([k, d]) => <div key={k} className="st-kv"><span className="fr-faint">{k}</span><span className="fr-mono">Δ {d[0].toFixed(3)}, {d[1].toFixed(3)}</span></div>)}
                <p className="fr-hint">{tt('Drag with “Binding” set and that parameter away from 0 to draw how the slider moves this point.')}</p>
                <div className="st-buttons">
                  <Button onClick={() => updateArt((a) => {
                    const path = a.layers[layerIx]!.shapes![shapeIx]!.path;
                    if (!path) return;
                    const i = path.findIndex((s) => (s.slice(1) as string[]).includes(point));
                    const s = path[i];
                    if (!s || s[0] === 'M') return;
                    if (s[0] === 'L') {
                      // Curve: a control point halfway to the previous point.
                      const prev = path[i - 1]?.slice(-1)[0] as string | undefined;
                      const cp = newPointName(a, 'c');
                      const P = prev && a.points[prev] ? a.points[prev]!.p : a.points[point]!.p;
                      a.points[cp] = { p: [(P[0] + a.points[point]!.p[0]) / 2, (P[1] + a.points[point]!.p[1]) / 2 - 0.1] };
                      path[i] = ['Q', cp, point] as Seg;
                    } else path[i] = ['L', point] as Seg;
                  })}>{tt('Toggle curve')}</Button>
                  <Button icon={<Trash2 size={14} />} onClick={() => { updateArt((a) => {
                    for (const l of a.layers) for (const s of l.shapes ?? []) if (s.path) s.path = s.path.filter((seg) => !(seg.slice(1) as string[]).includes(point)) as Seg[];
                    if (!usedPoints(a).has(point)) delete a.points[point];
                  }); setPoint(undefined); }}>{tt('Delete point')}</Button>
                </div>
              </Section>
            )}
            <Section title={tt('Parameters')} summary={String(paramKeys.length)} open={sec('params')} onToggle={(o) => tog('params', o)}>
              {paramKeys.length ? paramKeys.map((k) => <SliderRow key={k} label={k} value={Math.round((params[k] ?? 0) * 100)} min={-100} max={100} defaultValue={0} format={(v) => (v / 100).toFixed(2)} onChange={(v) => setParams((p) => ({ ...p, [k]: v / 100 }))} />) : <p className="fr-hint">{tt('This part\'s points do not respond to any parameter yet.')}</p>}
            </Section>
            <Section title={tt('Anchors')} summary={String(Object.keys(art?.anchors ?? {}).length)} open={sec('anchors')} onToggle={(o) => tog('anchors', o)}>
              {Object.entries(art?.anchors ?? {}).map(([n, a]) => (
                <div key={n} className="st-grid2">
                  <NumberField label={`${n} u`} value={a.at[0]} step={0.01} precision={3} onChange={(v) => updateArt((x) => { x.anchors![n]!.at = [v, x.anchors![n]!.at[1]]; })} />
                  <NumberField label={`${n} v`} value={a.at[1]} step={0.01} precision={3} onChange={(v) => updateArt((x) => { x.anchors![n]!.at = [x.anchors![n]!.at[0], v]; })} />
                </div>
              ))}
              {!Object.keys(art?.anchors ?? {}).length && <p className="fr-hint">{tt('No anchors in this view. Head parts carry the feature anchors (eyes, brows, mouth, nose, ears).')}</p>}
            </Section>
            <Section title={tt('View exemption')} summary={fam?.exempt?.[view] ? 'Exempt' : fam?.views[view] ? 'Drawn' : 'Missing'} open={sec('exempt')} onToggle={(o) => tog('exempt', o)}>
              <TextField label={tt('Reason this view is not drawn')} placeholder={tt('e.g. Faces are not visible from behind')} value={fam?.exempt?.[view] ?? ''} onChange={(v) => edit((d) => {
                const f = d.families[family]!;
                f.exempt = { ...(f.exempt ?? {}) };
                if (v) f.exempt[view] = v;
                else delete f.exempt[view];
              }, 'preview')} onBlur={() => edit(() => undefined)} />
              {fam?.views[view] && <Button onClick={() => edit((d) => { delete d.families[family]!.views[view]; })}>{tt('Remove this view\'s drawing')}</Button>}
            </Section>
            <Section title={tt('Rig check')} summary={errors.length ? `${errors.length} problem(s)` : 'Passed'} open={sec('check')} onToggle={(o) => tog('check', o)}>
              {issues.length ? <ul className="st-problems" aria-label={tt('Rig check problems')}>{issues.map((i, n) => <li key={n}><StatusBadge tone={i.severity === 'error' ? 'danger' : 'warning'}>{i.severity === 'error' ? 'Error' : 'Warning'}</StatusBadge> {[i.family, i.view].filter(Boolean).join(' · ')} {i.message}</li>)}</ul> : <p>{tt('The part follows the part contract in both families and every view.')}</p>}
            </Section>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Views × layers × shapes tree for the current family (Design System §8.2). */
function partTree(data: PartData, family: StyleFamily, _q: string): TreeNode[] {
  const fam = data.families[family];
  const out: TreeNode[] = [];
  for (const v of VIEWS) {
    const art = fam?.views[v.value];
    out.push({ id: `view:${v.value}`, label: `${v.label} view`, meta: art ? `${art.layers.length} layers` : fam?.exempt?.[v.value] ? 'Exempt' : 'Missing', emphasis: 'group', hasChildren: !!art });
    art?.layers.forEach((l, i) => {
      out.push({ id: `layer:${v.value}:${i}`, parent: `view:${v.value}`, label: l.slot, meta: l.limb ? 'limb' : (l.space ?? 'head'), emphasis: 'leaf', searchText: `${l.slot} ${l.space ?? ''}` });
      (l.shapes ?? []).forEach((s, j) => out.push({ id: `shape:${v.value}:${i}:${j}`, parent: `layer:${v.value}:${i}`, label: s.id ?? (s.art ? 'Artwork' : s.ellipse ? 'Ellipse' : 'Shape'), meta: typeof s.fill === 'string' ? s.fill : s.fill ? 'gradient' : s.stroke ? 'line' : '', emphasis: 'detail' }));
    });
  }
  return out;
}
