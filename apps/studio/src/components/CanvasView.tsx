/** Canvas (Design System §6.1): stage frame at the output aspect, selection, drag to move, shot badge, style and zoom. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { evaluateFrame, seatAnchors, seatCommands, type EvaluatedFrame } from '@frame/core';
import { FloatingControl, IconButton, Segmented } from '@frame/ui';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';
import { instanceMenu, useContextMenu } from './ContextMenu.js';
import { DRAG_TYPE, placeAsset, type Hit } from './AssetsPanel.js';
import { ImportDialog } from './ImportDialog.js';
import type { Renderer } from '@frame/render';
import type { FamilyStyle } from '@frame/rig';

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function CanvasView() {
  const { studio, assets } = useCtx();
  const openMenu = useContextMenu();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const time = useStudio(studio, (s) => s.time);
  const playing = useStudio(studio, (s) => s.playing);
  const selection = useStudio(studio, (s) => s.selection);
  const family = useStudio(studio, (s) => s.family);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 800, h: 450 });
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [dropped, setDropped] = useState<{ file: File; position: { x: number; y: number } }>();
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<string, FamilyStyle>>();
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [ev, setEv] = useState<EvaluatedFrame>();
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getRenderer().then(setRenderer).catch((e: Error) => setError(`The preview renderer could not start: ${e.message}`));
    getStyles().then((s) => setStyles(s)).catch(() => setError('Style guides could not be loaded'));
  }, []);
  useEffect(() => {
    const off = assets.onChange(() => setAssetsVersion((v) => v + 1));
    return () => {
      off();
    };
  }, [assets]);
  useEffect(() => {
    if (sceneId) assets.prefetchScene(sceneId).catch(() => undefined);
  }, [sceneId, assets]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const out = project.project.output;
  const aspect = out.width / out.height;
  const fit = Math.min((box.w - 48) / out.width, (box.h - 48) / out.height);
  const scale = zoom === 'fit' ? Math.max(0.05, fit) : zoom;
  const cssW = Math.round(out.width * scale);
  const cssH = Math.round(cssW / aspect);
  // Render at device resolution; during playback at half resolution (indicated), never changing timing (FR-RND-03).
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const quality = playing ? 0.5 : 1;
  const rw = Math.max(16, Math.min(out.width * 2, Math.round(cssW * dpr * quality)));
  const rh = Math.max(9, Math.round(rw / aspect));

  useEffect(() => {
    if (!renderer || !styles || !sceneId || !project.scenes[sceneId] || !canvas.current) return;
    try {
      const opts = { assets: { manifest: assets.manifest }, styles: styles as never, width: rw, height: rh, ...(family ? { family } : {}), aspect: `${out.aspectRatios[0] ?? '16:9'}` };
      // A transition into this scene blends from the previous scene's last picture, as in an episode export (FR-FX-03).
      const ep = project.episodes[project.sceneEpisode[sceneId] ?? ''];
      const prev = ep ? ep.scenes[ep.scenes.indexOf(sceneId) - 1] : undefined;
      const before = prev && project.scenes[prev] ? () => evaluateFrame(project, prev, project.scenes[prev]!.duration - 1, { ...opts, captions: false }).frame.items : undefined;
      const e = evaluateFrame(project, sceneId, Math.min(time, project.scenes[sceneId]!.duration - 1), { ...opts, captions: project.project.captions.enabled, ...(before ? { before } : {}) });
      blit(renderer, e.frame, canvas.current);
      setEv(e);
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [renderer, styles, project, sceneId, time, rw, rh, family, assetsVersion, assets, out.aspectRatios]);

  const k = cssW / rw;
  const boxes = useMemo(() => Object.entries(ev?.boxes ?? {}), [ev]);
  const hit = (x: number, y: number) => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const [id, b] = boxes[i]!;
      if (x >= b.x * k && x <= (b.x + b.w) * k && y >= b.y * k && y <= (b.y + b.h) * k) return id;
    }
    return undefined;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = hit(x, y);
    if (!id) {
      studio.set({ selection: [] });
      return;
    }
    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    const cur = studio.state.selection;
    if (multi) studio.set({ selection: cur.some((s) => s.id === id) ? cur.filter((s) => s.id !== id) : [...cur, { kind: 'instance', id }] });
    else if (!cur.some((s) => s.id === id)) studio.set({ selection: [{ kind: 'instance', id }] });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
  const onPointerUp = () => {
    if (!drag || !ev || !sceneId) return setDrag(null);
    const d = drag;
    setDrag(null);
    if (Math.abs(d.dx) < 2 && Math.abs(d.dy) < 2) return;
    // Screen pixels → stage units through the camera scale (one undo step per drag, Design System §8).
    const sx = ev.view[0] * k;
    const scene = project.scenes[sceneId]!;
    const ids = studio.state.selection.filter((s) => s.kind === 'instance').map((s) => s.id);
    const cmds = ids.map((id) => {
      const inst = scene.instances.find((i) => i.id === id)!;
      return { name: 'instance.update', params: { scene: sceneId, id, set: { transform: { ...inst.transform, x: Math.round(inst.transform.x + d.dx / sx), y: Math.round(inst.transform.y + d.dy / sx) } } } };
    });
    // Dropping one character on a seat seats it (FR-STG-04): hips on the seat anchor, in front of the seat.
    const one = ids.length === 1 ? scene.instances.find((i) => i.id === ids[0]) : undefined;
    if (one?.kind === 'character' && styles) {
      const nx = one.transform.x + d.dx / sx;
      const ny = one.transform.y + d.dy / sx;
      const seatHit = scene.instances.flatMap((p) => {
        if (p.id === one.id || !p.asset || (p.kind !== 'prop' && p.kind !== 'set-piece')) return [];
        return Object.values(seatAnchors(assets.manifest(p.asset)?.anchors as Record<string, unknown> | undefined)).map((a) => ({ p, x: p.transform.x + a[0] * p.transform.scale * (p.transform.flipX ? -1 : 1), y: p.transform.y + a[1] * p.transform.scale }));
      }).find((h) => Math.abs(h.x - nx) < 70 && ny > h.y - 40 && ny < h.p.transform.y + 80);
      if (seatHit) {
        try {
          void studio.exec(seatCommands(project, sceneId, one.id, seatHit.p.id, { assets: { manifest: assets.manifest }, styles: styles as never, ...(family ? { family } : {}) }), `Seat ${one.name} on ${seatHit.p.name}`);
          return;
        } catch (err) {
          studio.set({ lastError: { message: (err as Error).message } });
        }
      }
    }
    void studio.exec(cmds, ids.length === 1 ? `Move ${scene.instances.find((i) => i.id === ids[0])?.name ?? 'object'}` : `Move ${ids.length} objects`);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = hit(e.clientX - r.left, e.clientY - r.top) ?? studio.state.selection.find((s) => s.kind === 'instance')?.id;
    if (!id) return;
    if (!studio.state.selection.some((s) => s.id === id)) studio.set({ selection: [{ kind: 'instance', id }] });
    openMenu({ x: e.clientX, y: e.clientY, items: instanceMenu(studio, id), label: 'Object actions' });
  };
  // Library drops (Design System §8): characters/props land where dropped; expressions and actions apply to the
  // character under the pointer at the playhead.
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    const file = e.dataTransfer.files?.[0];
    if ((!raw && !file) || !ev || !sceneId) return;
    e.preventDefault();
    const stage = (e.currentTarget as HTMLElement).querySelector('.st-stage')!.getBoundingClientRect();
    const px = (e.clientX - stage.left) / k;
    const py = (e.clientY - stage.top) / k;
    // Invert the camera's stage → screen matrix (scale + translation; rotation inverted generally).
    const [a, b, c, d, tx, ty] = ev.view;
    const det = a * d - b * c;
    const x = (d * (px - tx) - c * (py - ty)) / det;
    const y = (-b * (px - tx) + a * (py - ty)) / det;
    // Files dropped from the desktop open the import dialog at the drop point (FR-IMP-01).
    if (!raw && file) {
      setDropped({ file, position: { x: Math.round(x), y: Math.round(y) } });
      return;
    }
    const h = JSON.parse(raw) as Hit;
    const target = hit(e.clientX - stage.left, e.clientY - stage.top);
    const targetIsChar = target && project.scenes[sceneId]!.instances.find((i) => i.id === target)?.kind === 'character';
    if ((h.kind === 'exp' || h.kind === 'act') && !targetIsChar) {
      studio.set({ lastError: { message: `Drop ${h.name} onto a character.` } });
      return;
    }
    void placeAsset(studio, h, { position: { x: Math.round(x), y: Math.round(y) }, ...(targetIsChar ? { character: target } : {}) });
  };
  const selIds = new Set(selection.filter((s) => s.kind === 'instance').map((s) => s.id));
  return (
    <div className="st-canvas" ref={wrap} onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={onDrop}>
      <div className="st-stage" style={{ width: cssW, height: cssH }} onContextMenu={onContextMenu} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="img" aria-label={`Stage preview${ev ? `, camera ${ev.camera.name}` : ''}`}>
        <canvas ref={canvas} style={{ width: cssW, height: cssH, display: 'block' }} data-testid="stage-canvas" />
        {ev && <span className="st-shot">{ev.camera.name}</span>}
        {playing && quality < 1 && <span className="st-quality">Preview quality</span>}
        {boxes.filter(([id]) => selIds.has(id)).map(([id, b]) => {
          const off = drag && selIds.has(drag.id) ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          return <div key={id} className="st-sel" style={{ left: b.x * k + off.x, top: b.y * k + off.y, width: b.w * k, height: b.h * k }}><i /><i /><i /><i /></div>;
        })}
        {error && <div className="st-canvas-error" role="alert">{error}</div>}
      </div>
      <FloatingControl label="Style" style={{ position: 'absolute', left: 14, bottom: 12 }}>
        <span className="fr-faint" style={{ padding: '0 6px' }}>Style</span>
        <Segmented label="Preview style family" value={family ?? project.project.styleFamily} onChange={(v) => studio.set({ family: v === project.project.styleFamily ? undefined : v })} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
      </FloatingControl>
      <FloatingControl label="Zoom" style={{ position: 'absolute', right: 14, bottom: 12 }}>
        <IconButton size="sm" label="Zoom out" icon={<Minus size={14} />} onClick={() => setZoom(ZOOMS.filter((z) => z < scale - 1e-6).at(-1) ?? ZOOMS[0]!)} />
        <button type="button" className="st-zoom" onClick={() => setZoom('fit')} title="Fit to window">{zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}</button>
        <IconButton size="sm" label="Zoom in" icon={<Plus size={14} />} onClick={() => setZoom(ZOOMS.find((z) => z > scale + 1e-6) ?? ZOOMS.at(-1)!)} />
      </FloatingControl>
      <ImportDialog file={dropped?.file} {...(dropped ? { position: dropped.position } : {})} onClose={() => setDropped(undefined)} />
    </div>
  );
}
