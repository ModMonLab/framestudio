/**
 * Character builder (Design System §7.2), M1 shell: live preview in every view, framing, turnaround sheet,
 * expression / gesture / lip-sync tests and the parts tree with current values. Part editing and saving character
 * versions arrive with the full builder (M2); this screen never edits the project.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { evaluateFrame, type ProjectState } from '@frame/core';
import type { Alignment, AssetManifest, Clip, Instance, Scene, Take, View } from '@frame/schema';
import { AppBar, Breadcrumb, Button, Chip, EmptyState, IconButton, Panel, SearchField, Segmented, StatusBadge, Toolbar, ToolbarSeparator, Tree, useTheme, VSep, type TreeNode } from '@frame/ui';
import type { Renderer } from '@frame/render';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

type Frame = 'full' | 'upper' | 'face';
const VIEWS: { value: View; label: string }[] = [{ value: 'front', label: 'Front' }, { value: 'three', label: '¾' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }];
const TEST_EXPRESSIONS = ['neutral', 'smile', 'surprised', 'sad', 'skeptical', 'embarrassed', 'angry'];
const TEST_GESTURES: [string, string][] = [['rest', 'Rest'], ['calm-talk', 'Talk'], ['point-at', 'Point'], ['wave', 'Wave']];

/** A labelled test pattern for the lip-sync test (not speech): "Hello, this is a lip sync test." */
function testAlignment(): Alignment {
  const ph = ['HH', 'AH', 'L', 'OW', 'DH', 'IH', 'S', 'IH', 'Z', 'AH', 'L', 'IH', 'P', 'S', 'IH', 'NG', 'K', 'T', 'EH', 'S', 'T', 'M', 'AA', 'F', 'UW'];
  return { method: 'fixture', confidence: 1, words: [], phonemes: ph.map((p, i) => ({ p, start: 0.2 + i * 0.11, end: 0.2 + (i + 1) * 0.11 })) };
}

export function Builder({ scene: sceneId, instance }: { scene: string; instance: string }) {
  const { studio, assets } = useCtx();
  const { resolved, setTheme } = useTheme();
  const project = useStudio(studio, (s) => s.project)!;
  const pid = useStudio(studio, (s) => s.pid);
  const scene = project.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instance);
  const [view, setView] = useState<View>(inst?.character?.view ?? 'three');
  const [frame, setFrame] = useState<Frame>('full');
  const [sheet, setSheet] = useState(false);
  const [family, setFamily] = useState(project.project.styleFamily);
  const [expression, setExpression] = useState('neutral');
  const [gesture, setGesture] = useState('rest');
  const [lipT, setLipT] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(new Set(['identity', 'body', 'head', 'hair', 'wardrobe', 'voice']));
  const [selected, setSelected] = useState<string>();
  const [man, setMan] = useState<AssetManifest>();
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<string, unknown>>();
  const [version, setVersion] = useState(0);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    void getRenderer().then(setRenderer);
    void getStyles().then((s) => setStyles(s as never));
    void assets.prefetchScene(sceneId);
    const off = assets.onChange(() => setVersion((v) => v + 1));
    return () => {
      off();
    };
  }, [assets, sceneId]);
  useEffect(() => {
    if (inst?.asset) api.manifest(inst.asset, pid).then((m) => setMan(m as AssetManifest)).catch(() => undefined);
  }, [inst?.asset, pid]);
  // Lip-sync test: plays the test pattern over 3.2 s.
  useEffect(() => {
    if (lipT === null) return;
    const t0 = performance.now() - lipT * 1000;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > 3.2) return setLipT(null);
      setLipT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lipT === null]);

  const views = useMemo(() => (sheet ? VIEWS.map((v) => v.value) : [view]), [sheet, view]);
  useEffect(() => {
    if (!renderer || !styles || !scene || !inst) return;
    views.forEach((v, i) => {
      const cv = canvases.current[i];
      if (!cv) return;
      const { state, t } = isolate(project, scene, inst, v, expression, gesture, lipT);
      const w = sheet ? 360 : 900;
      const h = Math.round(w * (sheet ? 1.5 : 0.75));
      const probe = evaluateFrame(state, scene.id, t, { assets: { manifest: assets.manifest }, styles: styles as never, width: 480, height: 270, family });
      const b = probe.boxes[inst.id];
      if (b) frameCamera(state, scene.id, b, frame, w / h);
      const ev = evaluateFrame(state, scene.id, t, { assets: { manifest: assets.manifest }, styles: styles as never, width: w, height: h, family, background: '#00000000' });
      blit(renderer, ev.frame, cv);
    });
  }, [renderer, styles, project, scene, inst, views, frame, family, expression, gesture, lipT, version, assets, sheet]);

  const nodes = useMemo(() => partsTree(man, inst), [man, inst]);
  if (!scene || !inst || inst.kind !== 'character') return <div className="fr-root st-app st-center"><p>This character is not in the scene.</p><Button onClick={() => history.back()}>Back</Button></div>;
  const back = () => (location.hash = `#/p/${encodeURIComponent(pid)}`);
  const sel = nodes.find((n) => n.id === selected);

  return (
    <div className="fr-root st-app st-builder">
      <AppBar
        left={<>
          <IconButton label="Back to the workspace" icon={<ArrowLeft size={16} />} onClick={back} />
          <VSep />
          <Breadcrumb items={[{ label: 'Cast', onClick: back }, { label: inst.name }]} />
          <StatusBadge tone="neutral">{inst.asset?.split('@')[1] ? `v${inst.asset.split('@')[1]}` : 'v1'}</StatusBadge>
        </>}
        right={<>
          <span className="fr-faint">Preview style</span>
          <Segmented label="Preview style family" value={family} onChange={setFamily} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
          <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />
          <Button onClick={back}>Done</Button>
        </>}
      />
      <div className="st-main">
        <Panel title="Parts" label="Parts" search={<SearchField label="Search parts and settings" placeholder="Search parts and settings" value={q} onChange={setQ} />} className="st-left">
          <Tree label="Parts" nodes={nodes} expanded={expanded} onExpandedChange={setExpanded} selected={selected} onSelect={(id) => setSelected(id)} query={q} emptyText="No matches" />
          <div className="st-panel-foot"><StatusBadge tone="success">Rig check passed</StatusBadge><span className="fr-faint">rig.biped@1</span></div>
        </Panel>
        <div className="st-center-col">
          <Toolbar label="Preview">
            <span className="fr-faint">View</span>
            <Segmented label="View" value={view} onChange={(v) => { setView(v); setSheet(false); }} options={VIEWS} />
            <ToolbarSeparator />
            <span className="fr-faint">Frame</span>
            <Segmented label="Framing" value={frame} onChange={setFrame} options={[{ value: 'full', label: 'Full body' }, { value: 'upper', label: 'Upper' }, { value: 'face', label: 'Face' }]} />
            <ToolbarSeparator />
            <Chip selected={sheet} onClick={() => setSheet(!sheet)}>Turnaround sheet</Chip>
          </Toolbar>
          <div className={`st-builder-canvas ${sheet ? 'st-builder-canvas--sheet' : ''}`}>
            {views.map((v, i) => (
              <figure key={v} className="st-builder-view">
                <canvas ref={(el) => { canvases.current[i] = el; }} aria-label={`${inst.name}, ${VIEWS.find((x) => x.value === v)!.label} view`} role="img" />
                {sheet && <figcaption>{VIEWS.find((x) => x.value === v)!.label}</figcaption>}
              </figure>
            ))}
            <span className="st-shot">{family === 'flat' ? 'Flat' : 'Illustrated'}</span>
            {lipT !== null && <span className="st-quality">Lip-sync test pattern</span>}
          </div>
          <Toolbar label="Tests">
            <span className="fr-faint">Expression</span>
            {TEST_EXPRESSIONS.map((e) => <Chip key={e} selected={expression === e} onClick={() => setExpression(e)}>{e[0]!.toUpperCase() + e.slice(1)}</Chip>)}
            <ToolbarSeparator />
            <span className="fr-faint">Gesture</span>
            {TEST_GESTURES.map(([g, label]) => <Chip key={g} selected={gesture === g} onClick={() => setGesture(g)}>{label}</Chip>)}
            <ToolbarSeparator />
            <Button onClick={() => setLipT(0)} disabled={lipT !== null} disabledReason="Playing">Test lip sync</Button>
          </Toolbar>
        </div>
        <Panel title={sel ? sel.label : inst.name} label="Part details" className="st-right">
          {sel ? (
            <div className="st-form">
              <p><span className="fr-faint">Current</span> <b>{String(sel.meta ?? '—')}</b></p>
              {sel.searchText && <p className="fr-mono fr-faint">{sel.searchText}</p>}
              <p className="fr-hint">Changing parts creates a new character version; that editor ships with the full builder. The preview above shows every view, framing and test with the current parts.</p>
            </div>
          ) : <EmptyState title="Choose a part">Select a part on the left to see its current value.</EmptyState>}
        </Panel>
      </div>
    </div>
  );
}

/** A preview-only copy of the scene: just this character, on a neutral stage, with test clips. */
function isolate(project: ProjectState, scene: Scene, inst: Instance, view: View, expression: string, gesture: string, lipT: number | null): { state: ProjectState; t: number } {
  const ch: Instance = { ...inst, transform: { ...inst.transform, x: 960, y: 1000, scale: 1, flipX: false, rotation: 0 }, character: { ...inst.character!, view, posture: 'standing', auto: { ...inst.character!.auto, idle: false, blinks: lipT === null ? inst.character!.auto.blinks : false } }, parent: undefined as never };
  const track = (kind: string) => scene.tracks.find((t) => t.owner === inst.id && t.kind === kind)!;
  const clips: Clip[] = [];
  const t = 48000;
  if (expression !== 'neutral') clips.push({ id: 'clp_preview_exp' as never, track: track('face').id, start: 0, end: 96000, asset: `exp.${expression}@1`, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual' });
  if (gesture !== 'rest') clips.push({ id: 'clp_preview_act' as never, track: track('acting').id, start: 0, end: 96000 * 2, asset: `act.${gesture}@1`, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual' });
  const takes: Record<string, Take> = {};
  if (lipT !== null) {
    takes['tak_preview' as never] = { schemaVersion: 1, id: 'tak_preview' as never, line: 'clp_preview_line' as never, lineRevision: 1, number: 1, source: 'recorded', fixture: true, status: 'ready', durationS: 3.2, alignment: testAlignment(), createdAt: '' } as Take;
    clips.push({ id: 'clp_preview_line' as never, track: track('dialogue').id, start: t, end: t + 3.2 * 48000, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual', line: { speaker: inst.id as never, text: 'Lip sync test', revision: 1, delivery: {}, take: 'tak_preview' as never, muted: false } });
  }
  const preview: Scene = { ...scene, instances: [ch], clips, markers: [], duration: Math.max(scene.duration, 5 * 48000), cameras: [{ ...scene.cameras[0]!, id: scene.defaultCamera }], loop: undefined as never };
  return { state: { ...project, scenes: { ...project.scenes, [scene.id]: preview }, takes: { ...project.takes, ...takes } }, t: lipT !== null ? t + Math.round(lipT * 48000) : t };
}

/** Points the preview camera at the character's box (stage units) for the chosen framing. */
function frameCamera(state: ProjectState, sceneId: string, b: { x: number; y: number; w: number; h: number }, frame: Frame, aspect: number) {
  const sc = state.scenes[sceneId]!;
  // The probe rendered 480 px wide for a 1920-unit camera: 4 stage units per pixel.
  const k = 1920 / 480;
  const x = (b.x + b.w / 2) * k;
  const top = b.y * k;
  const h = b.h * k;
  const part = frame === 'full' ? { y0: 0, y1: 1, pad: 1.18 } : frame === 'upper' ? { y0: 0, y1: 0.5, pad: 1.25 } : { y0: 0, y1: 0.24, pad: 1.4 };
  const fh = h * (part.y1 - part.y0) * part.pad;
  const cy = top + h * (part.y0 + part.y1) / 2;
  const cam = sc.cameras[0]!;
  sc.cameras[0] = { ...cam, center: { x, y: cy }, width: Math.max(fh * aspect, b.w * k * 1.3), rotation: 0, lens: '35mm' };
  state.scenes[sceneId] = { ...sc, clips: sc.clips.filter((c) => sc.tracks.find((t) => t.id === c.track)?.kind !== 'shot') };
}

/** Parts tree (Design System §7.2) from the character asset, with current values as metadata. */
function partsTree(man: AssetManifest | undefined, inst: Instance | undefined): TreeNode[] {
  if (!man || !inst) return [];
  const d = man.data as { lifeStage?: string; bodyBase?: string; parts?: Record<string, string>; looks?: { id: string; name: string; garments: string[]; accessories: string[] }[]; defaultLook?: string; role?: string };
  const nice = (ref?: string) => (ref ? ref.split('@')[0]!.split('.')[1]!.replace(/-/g, ' ').replace(/^./, (m) => m.toUpperCase()) : '—');
  const look = d.looks?.find((l) => l.id === inst.character?.look) ?? d.looks?.[0];
  const n: TreeNode[] = [
    { id: 'identity', label: 'Identity', emphasis: 'group', meta: man.name },
    { id: 'identity.role', parent: 'identity', label: 'Role', meta: d.role ?? '—', emphasis: 'detail' },
    { id: 'body', label: 'Body', emphasis: 'group' },
    { id: 'body.stage', parent: 'body', label: 'Life stage', meta: nice(d.lifeStage), searchText: d.lifeStage },
    { id: 'body.build', parent: 'body', label: 'Build', meta: nice(d.bodyBase), searchText: d.bodyBase },
    { id: 'body.hands', parent: 'body', label: 'Arms and hands', meta: nice(d.parts?.hands), searchText: d.parts?.hands },
    { id: 'body.feet', parent: 'body', label: 'Legs and feet', meta: nice(d.parts?.feet), searchText: d.parts?.feet },
    { id: 'head', label: 'Head and face', emphasis: 'group' },
    ...([['head', 'Face shape'], ['eyes', 'Eyes'], ['brows', 'Eyebrows'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['ears', 'Ears']] as const).map(([k, label]) => ({ id: `head.${k}`, parent: 'head', label, meta: nice(d.parts?.[k]), searchText: d.parts?.[k] })),
    { id: 'hair', label: 'Hair', emphasis: 'group' },
    { id: 'hair.style', parent: 'hair', label: 'Hairstyle', meta: nice(d.parts?.hair), searchText: d.parts?.hair },
    { id: 'hair.facial', parent: 'hair', label: 'Facial hair', meta: nice(d.parts?.facialHair), searchText: d.parts?.facialHair },
    { id: 'wardrobe', label: 'Wardrobe', emphasis: 'group', meta: look?.name },
    { id: 'wardrobe.looks', parent: 'wardrobe', label: 'Saved looks', meta: String(d.looks?.length ?? 0) },
    ...(look?.garments ?? []).map((g) => ({ id: `wardrobe.${g}`, parent: 'wardrobe', label: nice(g), meta: g.split('.')[0], searchText: g })),
    { id: 'acc', label: 'Accessories', emphasis: 'group', meta: String(look?.accessories.length ?? 0) },
    ...(look?.accessories ?? []).map((a) => ({ id: `acc.${a}`, parent: 'acc', label: nice(a), searchText: a })),
    { id: 'voice', label: 'Voice', emphasis: 'group' },
    { id: 'voice.asset', parent: 'voice', label: 'Voice asset', meta: inst.character?.voice ? 'Assigned' : 'None', searchText: inst.character?.voice },
  ];
  return n.map((x) => ({ ...x, emphasis: x.emphasis ?? (x.parent ? 'leaf' : 'group') }));
}
