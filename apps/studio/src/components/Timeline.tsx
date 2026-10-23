/** Timeline (Design System §6.2): toolbar, ruler, grouped tracks, clips, lip-sync lane, playhead. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, ChevronRight, HelpCircle, Eye, EyeOff, Lock, Maximize, Scan, SkipBack, Sparkles, SplitSquareHorizontal, Video, Volume2 } from 'lucide-react';
import { applyOverrides, conflictingClipIds, duckCurve, scheduleSceneAudio, formatTimecode, lineTakeState, mouthTrackFromAlignment, type ProjectState } from '@frame/core';
import type { Clip, MouthBlock, MouthShape, Scene, Track } from '@frame/schema';
import { LevelMeter } from './LevelMeter.js';
import { scrubAudio } from '../lib/playback.js';
import { Button, IconButton, PlayFilled, PauseFilled, SearchField, Segmented, SliderRow, useToasts, t as tt } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';
import { clipMenu, useContextMenu } from './ContextMenu.js';
import { DRAG_TYPE, placeAsset, type Hit } from './AssetsPanel.js';

const HEADER = 200;
type Filter = 'all' | 'picture' | 'audio';
const AUDIO = new Set(['dialogue', 'music', 'ambience', 'sfx', 'lipsync']);
const CATEGORY: Record<string, string> = { shot: 'camera', 'camera-move': 'camera', dialogue: 'dialogue', lipsync: 'dialogue', acting: 'acting', face: 'face', gaze: 'acting', effect: 'effect', music: 'sound', ambience: 'sound', sfx: 'sound', text: 'text' };

interface Group {
  id: string;
  name: string;
  key: string;
  tracks: Track[];
}

export function Timeline() {
  const { studio, assets } = useCtx();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const time = useStudio(studio, (s) => s.time);
  const playing = useStudio(studio, (s) => s.playing);
  const selection = useStudio(studio, (s) => s.selection);
  const ripple = useStudio(studio, (s) => !!s.ripple);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [pxPerSec, setPx] = useState(60);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [autoBusy, setAutoBusy] = useState(false);
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const scroller = useRef<HTMLDivElement>(null);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const fps = project.project.frameRate;
  // Pinch zoom (FR-TML-08): trackpad pinch (ctrl + wheel) and two-finger touch, anchored under the fingers.
  const pxRef = useRef(pxPerSec);
  pxRef.current = pxPerSec;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const zoomAt = (clientX: number, factor: number) => {
      const old = pxRef.current;
      const next = Math.max(10, Math.min(300, old * factor));
      if (next === old) return;
      const local = clientX - el.getBoundingClientRect().left - HEADER + el.scrollLeft;
      setPx(next);
      requestAnimationFrame(() => el.scrollTo({ left: Math.max(0, (local / old) * next - (clientX - el.getBoundingClientRect().left - HEADER)) }));
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(e.clientX, Math.exp(-e.deltaY * 0.01));
    };
    const touches = new Map<number, number>();
    let span = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, e.clientX);
      if (touches.size === 2) span = Math.abs([...touches.values()].reduce((a, b) => a - b));
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, e.clientX);
      if (touches.size !== 2 || span < 10) return;
      const xs = [...touches.values()];
      const now = Math.abs(xs[0]! - xs[1]!);
      zoomAt((xs[0]! + xs[1]!) / 2, now / span);
      span = now;
    };
    const up = (e: PointerEvent) => touches.delete(e.pointerId);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [sceneId]);

  const groups = useMemo<Group[]>(() => {
    if (!scene) return [];
    const byOwner = (owner: string) => scene.tracks.filter((t) => t.owner === owner);
    const g: Group[] = [{ id: 'camera', name: 'Camera', key: 'camera', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'shot' || t.kind === 'camera-move')) }];
    for (const i of scene.instances.filter((x) => x.kind === 'character')) g.push({ id: i.id, name: i.name, key: 'character', tracks: byOwner(i.id) });
    // Props with their own tracks (state changes, FR-TML-01); interactions stay on the character's Acting lane.
    const props = scene.instances.filter((i) => i.kind !== 'character').map((i) => i.id);
    const propTracks = scene.tracks.filter((t) => props.includes(t.owner)).map((t) => ({ ...t, name: `${scene.instances.find((i) => i.id === t.owner)!.name} · ${t.name}` }));
    if (propTracks.length) g.push({ id: 'props', name: 'Props', key: 'prop', tracks: propTracks });
    g.push({ id: 'fx', name: 'Effects and text', key: 'effect', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'effect' || t.kind === 'text')) });
    g.push({ id: 'sound', name: 'Sound', key: 'sound', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'music' || t.kind === 'ambience' || t.kind === 'sfx')) });
    return g
      .map((x) => ({ ...x, tracks: x.tracks.filter((t) => (filter === 'all' || (filter === 'audio') === AUDIO.has(t.kind)) && (!q || t.name.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()))) }))
      .filter((x) => x.tracks.length > 0);
  }, [scene, filter, q]);

  // Conflicting clips are hatched at edit time (FR-CAM-07): same-channel overlaps, same-speaker overlaps, shots, past end.
  const conflicts = useMemo(() => (scene ? conflictingClipIds(scene, { manifest: (r) => assets.manifest(r) }) : new Set<string>()), [scene, assets]);
  // The same plan the mix uses (FR-SND-03), so the curve is exactly what is heard.
  const duck = useMemo(() => (scene ? duckCurve(scheduleSceneAudio(project, scene, undefined, { manifest: (r) => assets.manifest(r) })) : undefined), [project, scene, assets]);

  if (!scene) return null;
  const width = Math.max(600, (scene.duration / 48000) * pxPerSec + 40);
  const x = (ticks: number) => (ticks / 48000) * pxPerSec;
  const seekFromEvent = (e: React.PointerEvent | React.MouseEvent, scrub = false) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, Math.min(scene.duration - 1, Math.round(((e.clientX - r.left) / pxPerSec) * fps) * (48000 / fps)));
    studio.set({ time: t, playing: false });
    // Dragging the playhead plays the mix under it (FR-TML-05).
    if (scrub) scrubAudio(pid, scene, () => scheduleSceneAudio(project, scene, undefined, { manifest: (ref) => assets.manifest(ref) }), t / 48000);
  };
  const selIds = new Set(selection.map((s) => s.id));
  const selClips = scene.clips.filter((c) => selIds.has(c.id));
  // Zoom to selection (FR-TML-08): the selected clips fill the visible width.
  const zoomTo = (start: number, end: number) => {
    const el = scroller.current;
    const w = (el?.clientWidth ?? 800) - HEADER - 40;
    const px = Math.max(10, Math.min(300, w / Math.max(0.25, (end - start) / 48000)));
    setPx(px);
    requestAnimationFrame(() => el?.scrollTo({ left: (start / 48000) * px - 20 }));
  };
  // Box selection (FR-TML-02): drag on empty lanes; Shift adds to the selection.
  const endMarquee = () => {
    const m = marquee;
    setMarquee(null);
    if (!m || (Math.abs(m.x1 - m.x0) < 4 && Math.abs(m.y1 - m.y0) < 4)) return;
    const [l, r, t, b] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1), Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
    const hits = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-clip]') ?? [])].filter((el) => {
      const rc = el.getBoundingClientRect();
      return rc.right >= l && rc.left <= r && rc.bottom >= t && rc.top <= b;
    }).map((el) => ({ kind: 'clip' as const, id: el.dataset.clip! }));
    studio.set({ selection: m.add ? [...studio.state.selection.filter((x) => !hits.some((h) => h.id === x.id)), ...hits] : hits });
  };
  const longScene = scene.duration > 90 * 48000;

  return (
    <section className="st-timeline" aria-label={tt('Timeline')}>
      <div className="st-tl-toolbar" role="toolbar" aria-label={tt('Transport')}>
        <IconButton label={tt('Back to start')} shortcut="Home" icon={<SkipBack size={15} />} onClick={() => studio.set({ time: 0, playing: false })} />
        <button type="button" className="st-play" aria-label={playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space" onClick={() => studio.set({ playing: !playing })}>{playing ? <PauseFilled /> : <PlayFilled />}</button>
        <LevelMeter playing={playing} />
        <span className="fr-mono st-timecode" aria-live="off">{formatTimecode(time)} / {formatTimecode(scene.duration)}</span>
        <span className="fr-spacer" />
        <Button
          icon={<Sparkles size={13} />}
          loading={autoBusy}
          disabled={!scene.instances.some((i) => i.kind === 'character')}
          disabledReason={tt('Add a character first')}
          title={tt('Generate talking gestures and listening reactions as editable clips (characters with automatic behaviour on)')}
          onClick={() => {
            setAutoBusy(true);
            api.autoPerformance(pid, scene.id, { kinds: ['talking', 'listening'] })
              .then((r) => toasts.show({ tone: 'success', message: r.added ? `Added ${r.added} automatic clips${r.removed ? ` (replaced ${r.removed})` : ''}. Undo removes them.` : 'No lines to perform yet.' }))
              .catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))
              .finally(() => setAutoBusy(false));
          }}
        >{tt('Auto performance')}</Button>
        <Button
          icon={<Volume2 size={13} />}
          title={tt('Add sound cues for actions and prop states as editable sound clips')}
          onClick={() => api.soundCues(pid, scene.id).then((r) => toasts.show({ tone: 'success', message: r.cues ? `${r.cues} sound cues on the Sound track` : 'No actions with sounds yet.' })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}
        >{tt('Sound cues')}</Button>
        <Button
          icon={<Video size={13} />}
          title={tt('Generate editable shots from the dialogue: an establishing wide, speaker close-ups and reactions')}
          onClick={() => api.coverage(pid, scene.id).then((r) => toasts.show({ tone: 'success', message: `${r.shots} shots on the Shot track. Undo removes them.` })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}
        >{tt('Auto coverage')}</Button>
        <div style={{ width: 170 }}><SearchField label={tt('Filter tracks')} placeholder={tt('Filter tracks')} value={q} onChange={setQ} /></div>
        <Segmented label={tt('Track filter')} value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'picture', label: 'Picture' }, { value: 'audio', label: 'Audio' }]} />
        <Button icon={<SplitSquareHorizontal size={13} />} aria-pressed={ripple} title={tt('Ripple: moving, trimming or deleting a clip shifts the later clips on its track')} onClick={() => studio.set({ ripple: !ripple })}>{tt('Ripple')}</Button>
        <IconButton label={tt('Zoom to selection')} icon={<Scan size={14} />} disabled={!selClips.length} disabledReason={tt('Select clips first')} onClick={() => zoomTo(Math.min(...selClips.map((c) => c.start)), Math.max(...selClips.map((c) => c.end)))} />
        <IconButton label={tt('Zoom to fit')} icon={<Maximize size={14} />} onClick={() => { const w = (scroller.current?.clientWidth ?? 800) - HEADER - 40; setPx(Math.max(10, Math.min(300, w / Math.max(1, scene.duration / 48000)))); }} />
        <div style={{ width: 220 }}><SliderRow inline label={tt('Zoom')} value={pxPerSec} min={10} max={300} defaultValue={60} format={(v) => `${Math.round(v)}`} onChange={(v) => setPx(v)} /></div>
        <IconButton size="sm" label={tt('Help: Timeline')} icon={<HelpCircle size={14} />} onClick={() => (location.hash = '#/help/timeline')} />
      </div>
      {longScene && <MiniMap scene={scene} pxPerSec={pxPerSec} scroller={scroller} />}
      <div className="st-tl-body" ref={scroller}>
        <div className="st-tl-grid" style={{ width: HEADER + width }}>
          <div className="st-tl-ruler-row">
            <div className="st-tl-corner" style={{ width: HEADER }} />
            <div className="st-tl-ruler" style={{ width }} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekFromEvent(e); }} onPointerMove={(e) => e.buttons & 1 && seekFromEvent(e, true)} role="slider" aria-label={tt('Playhead')} aria-valuemin={0} aria-valuemax={scene.duration / 48000} aria-valuenow={time / 48000} aria-valuetext={formatTimecode(time)} tabIndex={0}>
              {ticksFor(scene.duration, pxPerSec).map((s) => <span key={s} className="st-tick" style={{ left: s * pxPerSec }}>{s % 60 === 0 && s >= 60 ? `${s / 60}:00` : `${s}s`}</span>)}
              {scene.markers.map((m) => (
                <button key={m.id} type="button" className="st-marker" style={{ left: x(m.at) }} title={`${m.name} (double-click to rename, right-click to delete)`} aria-label={`Marker ${m.name}`}
                  onPointerDown={(e) => { e.stopPropagation(); studio.set({ time: m.at, playing: false }); }}
                  onDoubleClick={(e) => { e.stopPropagation(); const name = window.prompt('Marker name', m.name)?.trim(); if (name && name !== m.name) void studio.exec([{ name: 'marker.update', params: { scene: scene.id, id: m.id, name } }], `Rename marker to ${name}`); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); void studio.exec([{ name: 'marker.remove', params: { scene: scene.id, id: m.id } }], `Delete marker ${m.name}`); }} />
              ))}
              {scene.loop && <span className="st-loop" style={{ left: x(scene.loop.start), width: x(scene.loop.end - scene.loop.start) }} />}
            </div>
          </div>
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id} className="st-tl-group">
                <div className="st-tl-row st-tl-row--group">
                  <button type="button" className="st-tl-head st-tl-head--group" style={{ width: HEADER }} aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}>
                    <ChevronRight size={13} className={`fr-chev ${isCollapsed ? '' : 'fr-chev--open'}`} aria-hidden />
                    <span className={`st-key st-key--${g.key}`} aria-hidden />
                    <span className="st-tl-name">{g.name}</span>
                    <span className="fr-faint">{g.tracks.length}</span>
                  </button>
                  <div className="st-tl-lane st-tl-lane--group" style={{ width }}>
                    {isCollapsed && g.tracks.flatMap((t) => scene.clips.filter((c) => c.track === t.id)).map((c) => <span key={c.id} className={`st-strip st-cat--${CATEGORY[scene.tracks.find((t) => t.id === c.track)!.kind]}`} style={{ left: x(c.start), width: Math.max(2, x(c.end - c.start)) }} />)}
                  </div>
                </div>
                {!isCollapsed && g.tracks.map((t) => (
                  <div key={t.id} className="st-tl-row">
                    <TrackHeader scene={scene} track={t} />
                    <div
                      className="st-tl-lane"
                      style={{ width }}
                      onPointerDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        seekFromEvent(e);
                        if (!e.shiftKey) studio.set({ selection: [] });
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setMarquee({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, add: e.shiftKey });
                      }}
                      onPointerMove={(e) => marquee && setMarquee({ ...marquee, x1: e.clientX, y1: e.clientY })}
                      onPointerUp={endMarquee}
                      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) && (t.kind === 'face' || t.kind === 'acting')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                      onDrop={(e) => {
                        const raw = e.dataTransfer.getData(DRAG_TYPE);
                        if (!raw) return;
                        e.preventDefault();
                        const h = JSON.parse(raw) as Hit;
                        if ((t.kind === 'face' && h.kind !== 'exp' && h.kind !== 'overlay') || (t.kind === 'acting' && h.kind !== 'act')) {
                          studio.set({ lastError: { message: t.kind === 'face' ? 'Only expressions and face overlays go on the Face lane.' : 'Only actions go on the Acting lane.' } });
                          return;
                        }
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const at = Math.max(0, Math.round(((e.clientX - r.left) / pxPerSec) * fps) * (48000 / fps));
                        void placeAsset(studio, h, { at, character: t.owner });
                      }}
                    >
                      {(t.kind === 'music' || t.kind === 'ambience') && duck && scene.clips.some((c) => c.track === t.id) && <DuckCurve points={duck} x={x} width={width} depth={scene.audio.duckingDb} />}
                      {t.kind === 'lipsync' ? <LipLane project={project} scene={scene} owner={t.owner} x={x} /> : scene.clips.filter((c) => c.track === t.id).map((c) => <ClipChip key={c.id} project={project} scene={scene} clip={c} track={t} x={x} pxPerSec={pxPerSec} selected={selIds.has(c.id)} conflict={conflicts.has(c.id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="st-playhead" style={{ left: HEADER + x(time) }} aria-hidden />
          {marquee && (Math.abs(marquee.x1 - marquee.x0) > 3 || Math.abs(marquee.y1 - marquee.y0) > 3) && <Marquee m={marquee} grid={scroller.current} />}
        </div>
      </div>
    </section>
  );
}

function ticksFor(duration: number, pxPerSec: number): number[] {
  const secs = duration / 48000;
  const step = pxPerSec >= 120 ? 1 : pxPerSec >= 40 ? 2 : pxPerSec >= 20 ? 5 : 10;
  const out: number[] = [];
  for (let s = 0; s <= secs; s += step) out.push(s);
  return out;
}

/**
 * Ducking automation (FR-SND-03) drawn over music and ambience lanes: 0 dB at the top of the lane, the duck depth at
 * the bottom. Depth, attack and release are edited in the scene Mix section.
 */
function DuckCurve({ points, x, width, depth }: { points: [number, number][]; x: (t: number) => number; width: number; depth: number }) {
  if (depth >= 0 || points.length < 2) return null;
  const y = (db: number) => 3 + (db / depth) * 22;
  const d = points.map(([t, db], i) => `${i ? 'L' : 'M'}${x(t * 48000).toFixed(1)} ${y(db).toFixed(1)}`).join(' ') + ` L${width} ${y(points[points.length - 1]![1]).toFixed(1)}`;
  return (
    <svg className="st-duck" width={width} height={28} aria-label={`Ducking curve, ${depth} dB under dialogue`} role="img">
      <path d={d} fill="none" />
    </svg>
  );
}

function TrackHeader({ scene, track }: { scene: Scene; track: Track }) {
  const { studio } = useCtx();
  const openMenu = useContextMenu();
  const set = (patch: Partial<Track>, label?: string) => void studio.exec([{ name: 'track.update', params: { scene: scene.id, id: track.id, set: patch } }], label);
  const audio = AUDIO.has(track.kind) && track.kind !== 'lipsync';
  // Track controls (FR-TML-07): rename and per-track gain from the header's menu.
  const menu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu({ x: e.clientX, y: e.clientY, label: `${track.name} track`, items: [
      { id: 'rename', label: 'Rename…', onSelect: () => { const n = window.prompt('Track name', track.name)?.trim(); if (n) set({ name: n }, `Rename track to ${n}`); } },
      ...(audio ? [{ id: 'gain', label: `Gain (${track.gainDb >= 0 ? '+' : ''}${track.gainDb} dB)…`, onSelect: () => { const v = Number(window.prompt('Track gain in dB (−60 to +12)', String(track.gainDb))); if (Number.isFinite(v)) set({ gainDb: Math.max(-60, Math.min(12, Math.round(v * 10) / 10)) }, `${track.name} gain ${v} dB`); } }] : []),
      { id: 'hide', label: track.hidden ? 'Show in the picture' : 'Hide from the picture', onSelect: () => set({ hidden: !track.hidden }) },
    ] });
  };
  return (
    <div className="st-tl-head" style={{ width: HEADER }} onContextMenu={menu} title={audio && track.gainDb ? `${track.name} · ${track.gainDb > 0 ? '+' : ''}${track.gainDb} dB` : track.name}>
      <span className="st-tl-name st-tl-name--lane">{track.name}</span>
      <span className="fr-spacer" />
      {!audio && <button type="button" className="st-ms" aria-pressed={!!track.hidden} aria-label={`${track.hidden ? 'Show' : 'Hide'} ${track.name}`} onClick={() => set({ hidden: !track.hidden })}>{track.hidden ? <EyeOff size={11} aria-hidden /> : <Eye size={11} aria-hidden />}</button>}
      {audio && <button type="button" className="st-ms" aria-pressed={track.mute} aria-label={`Mute ${track.name}`} onClick={() => set({ mute: !track.mute })}>M</button>}
      {audio && <button type="button" className="st-ms" aria-pressed={track.solo} aria-label={`Solo ${track.name}`} onClick={() => set({ solo: !track.solo })}>S</button>}
      <button type="button" className="st-ms" aria-pressed={track.lock} aria-label={`Lock ${track.name}`} onClick={() => set({ lock: !track.lock })}><Lock size={11} aria-hidden /></button>
    </div>
  );
}

function clipLabel(project: ProjectState, scene: Scene, c: Clip, track: Track): string {
  if (c.line) return c.line.text;
  if (track.kind === 'shot') return scene.cameras.find((cam) => cam.id === c.params.camera)?.name ?? 'Shot';
  if (c.name) return c.name;
  if (c.asset) {
    const id = c.asset.split('@')[0]!;
    return project.assets[c.asset]?.name ?? id.split('.')[1]!.replace(/-/g, ' ').replace(/^./, (m) => m.toUpperCase());
  }
  return track.name;
}

function ClipChip({ project, scene, clip, track, x, pxPerSec, selected, conflict }: { project: ProjectState; scene: Scene; clip: Clip; track: Track; x: (t: number) => number; pxPerSec: number; selected: boolean; conflict: boolean }) {
  const { studio } = useCtx();
  const openMenu = useContextMenu();
  const [drag, setDrag] = useState<{ x0: number; dx: number; mode: 'move' | 'start' | 'end' } | null>(null);
  const fps = project.project.frameRate;
  const time = useStudio(studio, (s) => s.time);
  // Snapping (FR-TML-02): frames, the playhead, markers and other clips' edges within 8 px.
  const snap = (t: number): number => {
    const frame = 48000 / fps;
    // Word boundaries of aligned takes snap too (FR-TML-02).
    const words = scene.clips.flatMap((c) => {
      const take = c.line?.take ? project.takes[c.line.take] : undefined;
      return (take?.alignment?.words ?? []).flatMap((w) => [c.start + Math.round((w.start - (c.sourceIn ?? 0) / 48000) * 48000), c.start + Math.round((w.end - (c.sourceIn ?? 0) / 48000) * 48000)]);
    });
    const targets = [time, ...scene.markers.map((m) => m.at), ...scene.clips.filter((c) => c.id !== clip.id).flatMap((c) => [c.start, c.end]), ...words];
    const tol = (8 / pxPerSec) * 48000;
    let best = Math.round(t / frame) * frame;
    let d = tol;
    for (const g of targets) if (Math.abs(g - t) < d) {
      d = Math.abs(g - t);
      best = g;
    }
    return Math.max(0, best);
  };
  const ticksOf = (px: number) => (px / pxPerSec) * 48000;
  const preview = drag ? (drag.mode === 'move' ? { start: snap(clip.start + ticksOf(drag.dx)), end: 0 } : drag.mode === 'start' ? { start: Math.min(clip.end - 48000 / fps, snap(clip.start + ticksOf(drag.dx))), end: clip.end } : { start: clip.start, end: Math.max(clip.start + 48000 / fps, snap(clip.end + ticksOf(drag.dx))) }) : undefined;
  const shownStart = preview ? preview.start : clip.start;
  const shownEnd = preview ? (drag!.mode === 'move' ? preview.start + (clip.end - clip.start) : preview.end) : clip.end;
  const state = clip.line ? lineTakeState(project, clip) : undefined;
  const invalid = conflict || state === 'Missing' || state === 'Failed' || state === 'Outdated';
  const generating = state === 'Generating' || state === 'Queued';
  const muted = clip.line?.muted || !clip.enabled;
  const label = clipLabel(project, scene, clip, track);
  // Changes made by agents stay visible to people (FR-AGT-04/05, AC-13).
  const agent = clip.source?.startsWith('agent:') ? clip.source.slice(6) : undefined;
  const commitMove = () => {
    if (!drag || !preview) return;
    const mode = drag.mode;
    setDrag(null);
    if (track.lock || Math.abs(drag.dx) < 2) return;
    const ripple = !!studio.state.ripple;
    if (mode === 'move') {
      const dt = shownStart - clip.start;
      // Selected clips move together; with ripple the later clips on their tracks follow.
      const sel = studio.state.selection.filter((s) => s.kind === 'clip').map((s) => s.id);
      const ids = sel.includes(clip.id) ? sel : [clip.id];
      if (dt !== 0) void studio.exec([{ name: 'clip.move', params: { scene: scene.id, ids, delta: dt, ...(ripple ? { ripple: true } : {}) } }], ids.length > 1 ? `Move ${ids.length} clips` : `Move ${label.slice(0, 24)}`);
    } else {
      // Trimming media clips moves their source in-point; nothing is time-stretched (FR-TML-03).
      const to = mode === 'start' ? shownStart : shownEnd;
      if (to !== (mode === 'start' ? clip.start : clip.end)) void studio.exec([{ name: 'clip.trim', params: { scene: scene.id, id: clip.id, edge: mode, to, ...(ripple && mode === 'end' ? { ripple: true } : {}) } }], `Trim ${label.slice(0, 24)}`);
    }
  };
  return (
    <button
      type="button"
      className={`fr-clip st-cat--${CATEGORY[track.kind]} ${selected ? 'fr-clip--selected' : ''} ${invalid ? 'fr-clip--invalid' : ''} ${generating ? 'fr-clip--generating' : ''} ${muted ? 'fr-clip--muted' : ''}`}
      style={{ left: x(shownStart), width: Math.max(4, x(shownEnd - shownStart)) }}
      title={`${label}${state ? ` · ${state}` : ''}${conflict ? ' · In conflict (see Problems)' : ''}${agent ? ` · added by agent ${agent}` : ''}`}
      aria-pressed={selected}
      aria-label={`${track.name}: ${label}${state ? `, ${state}` : ''}${conflict ? ', in conflict' : ''}${agent ? ', added by an agent' : ''}`}
      data-clip={clip.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        // Shift adds; pressing an already selected clip keeps the selection so several clips drag together.
        const cur = studio.state.selection;
        if (e.shiftKey) studio.set({ selection: cur.some((x) => x.id === clip.id) ? cur : [...cur, { kind: 'clip', id: clip.id }] });
        else if (!cur.some((x) => x.id === clip.id)) studio.set({ selection: [{ kind: 'clip', id: clip.id }] });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        // The outer 6 px of a clip are trim handles (Design System §6.2); lines keep their take length.
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const edge = r.width > 18 && !clip.line ? (e.clientX - r.left < 6 ? 'start' : r.right - e.clientX < 6 ? 'end' : 'move') : 'move';
        setDrag({ x0: e.clientX, dx: 0, mode: edge });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
      onPointerUp={commitMove}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!studio.state.selection.some((x) => x.id === clip.id)) studio.set({ selection: [{ kind: 'clip', id: clip.id }] });
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu({ x: e.clientX || r.left, y: e.clientY || r.bottom, items: clipMenu(studio, clip.id), label: 'Clip actions' });
      }}
    >
      {!clip.line && <span className="st-trim st-trim--start" aria-hidden />}
      {!clip.line && <span className="st-trim st-trim--end" aria-hidden />}
      {conflict && <AlertTriangle size={11} aria-hidden className="st-agent-mark" />}
      {agent && <Bot size={11} aria-hidden className="st-agent-mark" />}
      {generating ? 'Generating · ' : ''}{label}
    </button>
  );
}

const MOUTHS: { shape: MouthShape; label: string }[] = [
  { shape: 'X', label: 'X · rest' }, { shape: 'A', label: 'A · closed (M, B, P)' }, { shape: 'B', label: 'B · teeth (K, S, T…)' }, { shape: 'C', label: 'C · open (EH, AE)' },
  { shape: 'D', label: 'D · wide open (AA)' }, { shape: 'E', label: 'E · rounded (AO, ER)' }, { shape: 'F', label: 'F · puckered (OO, W)' }, { shape: 'G', label: 'G · lip bite (F, V)' }, { shape: 'H', label: 'H · tongue (L, TH)' },
];

/**
 * Lip-sync lane (Design System §6.2): mouth-shape blocks from each line's chosen take, letter in mono 9 px. Clicking a
 * block changes its shape (FR-LIP-04); edits are stored on the line as overrides, so they survive re-alignment.
 */
function LipLane({ project, scene, owner, x }: { project: ProjectState; scene: Scene; owner: string; x: (t: number) => number }) {
  const { studio } = useCtx();
  const openMenu = useContextMenu();
  const dlg = scene.tracks.find((t) => t.owner === owner && t.kind === 'dialogue');
  const blocks: { start: number; end: number; shape: string; key: string; line: string; take: { start: number; end: number }; edited: boolean }[] = [];
  for (const c of scene.clips) {
    if (c.track !== dlg?.id || !c.line?.take) continue;
    const take = project.takes[c.line.take];
    if (!take?.alignment || lineTakeState(project, c) !== 'Ready') continue;
    const overrides = (c.line.mouthOverrides ?? []) as MouthBlock[];
    const mt = applyOverrides(mouthTrackFromAlignment(take.alignment, { fps: project.project.frameRate }).blocks, overrides);
    for (const [i, b] of mt.entries()) blocks.push({ start: c.start + b.start * 48000, end: c.start + b.end * 48000, shape: b.shape, key: `${c.id}:${i}`, line: c.id, take: { start: b.start, end: b.end }, edited: overrides.some((o) => o.start < b.end && o.end > b.start) });
  }
  const edit = (b: (typeof blocks)[number], shape: MouthShape | null) => {
    const c = scene.clips.find((x) => x.id === b.line)!;
    const others = ((c.line!.mouthOverrides ?? []) as MouthBlock[]).filter((o) => o.end <= b.take.start || o.start >= b.take.end);
    const next = shape ? [...others, { shape, start: b.take.start, end: b.take.end }].sort((p, q) => p.start - q.start) : others;
    void studio.exec([{ name: 'line.setMouthOverrides', params: { scene: scene.id, id: c.id, blocks: next.length ? next : null } }], shape ? `Mouth ${shape}` : 'Reset mouth block');
  };
  const menu = (e: React.MouseEvent, b: (typeof blocks)[number]) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu({ x: e.clientX, y: e.clientY, label: 'Mouth shape', items: [
      ...MOUTHS.map((m) => ({ id: m.shape, label: m.label, checked: m.shape === b.shape, onSelect: () => edit(b, m.shape) })),
      { kind: 'separator' as const, id: 's' },
      { id: 'reset', label: 'Back to the aligned shape', disabled: !b.edited, disabledReason: 'Not edited', onSelect: () => edit(b, null) },
    ] });
  };
  return <>{blocks.map((b) => <button type="button" key={b.key} className={`st-mouth ${b.edited ? 'st-mouth--edited' : ''}`} style={{ left: x(b.start), width: Math.max(1, x(b.end - b.start)) }} title={`Mouth ${b.shape}${b.edited ? ' (edited)' : ''} — click to change`} aria-label={`Mouth ${b.shape} at ${formatTimecode(b.start)}${b.edited ? ', edited' : ''}`} onClick={(e) => menu(e, b)} onContextMenu={(e) => menu(e, b)}>{x(b.end - b.start) > 9 ? b.shape : ''}</button>)}</>;
}

/** Selection rectangle in the timeline grid (client coordinates → grid coordinates). */
function Marquee({ m, grid }: { m: { x0: number; y0: number; x1: number; y1: number }; grid: HTMLDivElement | null }) {
  const r = grid?.firstElementChild?.getBoundingClientRect();
  if (!r) return null;
  return <span className="st-marquee" aria-hidden style={{ left: Math.min(m.x0, m.x1) - r.left, top: Math.min(m.y0, m.y1) - r.top, width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) }} />;
}

/** Overview of a long scene (FR-TML-08): every clip as a strip; the visible window can be dragged or clicked. */
function MiniMap({ scene, pxPerSec, scroller }: { scene: Scene; pxPerSec: number; scroller: React.RefObject<HTMLDivElement | null> }) {
  const [, force] = useState(0);
  const el = scroller.current;
  const span = scene.duration / 48000;
  const view = el ? { left: Math.max(0, el.scrollLeft) / pxPerSec, len: Math.max(0, el.clientWidth - HEADER) / pxPerSec } : { left: 0, len: span };
  const go = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const s = ((e.clientX - r.left) / r.width) * span;
    el?.scrollTo({ left: Math.max(0, (s - view.len / 2) * pxPerSec) });
    force((n) => n + 1);
  };
  const kinds = new Map(scene.tracks.map((t) => [t.id, t.kind]));
  return (
    <div className="st-minimap" role="slider" aria-label={tt('Timeline overview')} aria-valuemin={0} aria-valuemax={Math.round(span)} aria-valuenow={Math.round(view.left)} tabIndex={0}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); go(e); }} onPointerMove={(e) => e.buttons & 1 && go(e)}>
      {scene.clips.map((c) => <span key={c.id} className={`st-mini-clip st-cat--${CATEGORY[kinds.get(c.track) ?? ''] ?? 'effect'}`} style={{ left: `${(c.start / scene.duration) * 100}%`, width: `${Math.max(0.2, ((c.end - c.start) / scene.duration) * 100)}%` }} />)}
      <span className="st-mini-view" style={{ left: `${(view.left / span) * 100}%`, width: `${Math.min(100, (view.len / span) * 100)}%` }} />
    </div>
  );
}
