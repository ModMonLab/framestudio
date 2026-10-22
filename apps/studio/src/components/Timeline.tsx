/** Timeline (Design System §6.2): toolbar, ruler, grouped tracks, clips, lip-sync lane, playhead. */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, ChevronRight, Lock, SkipBack, Sparkles, Video, Volume2 } from 'lucide-react';
import { conflictingClipIds, formatTimecode, lineTakeState, mouthTrackFromAlignment, type ProjectState } from '@frame/core';
import type { Clip, Scene, Track } from '@frame/schema';
import { Button, IconButton, PlayFilled, PauseFilled, SearchField, Segmented, SliderRow, useToasts } from '@frame/ui';
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

  const groups = useMemo<Group[]>(() => {
    if (!scene) return [];
    const byOwner = (owner: string) => scene.tracks.filter((t) => t.owner === owner);
    const g: Group[] = [{ id: 'camera', name: 'Camera', key: 'camera', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'shot' || t.kind === 'camera-move')) }];
    for (const i of scene.instances.filter((x) => x.kind === 'character')) g.push({ id: i.id, name: i.name, key: 'character', tracks: byOwner(i.id) });
    g.push({ id: 'fx', name: 'Effects and text', key: 'effect', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'effect' || t.kind === 'text')) });
    g.push({ id: 'sound', name: 'Sound', key: 'sound', tracks: scene.tracks.filter((t) => t.owner === 'scene' && (t.kind === 'music' || t.kind === 'ambience' || t.kind === 'sfx')) });
    return g
      .map((x) => ({ ...x, tracks: x.tracks.filter((t) => (filter === 'all' || (filter === 'audio') === AUDIO.has(t.kind)) && (!q || t.name.toLowerCase().includes(q.toLowerCase()) || x.name.toLowerCase().includes(q.toLowerCase()))) }))
      .filter((x) => x.tracks.length > 0);
  }, [scene, filter, q]);

  // Conflicting clips are hatched at edit time (FR-CAM-07): same-channel overlaps, same-speaker overlaps, shots, past end.
  const conflicts = useMemo(() => (scene ? conflictingClipIds(scene, { manifest: (r) => assets.manifest(r) }) : new Set<string>()), [scene, assets]);

  if (!scene) return null;
  const width = Math.max(600, (scene.duration / 48000) * pxPerSec + 40);
  const x = (ticks: number) => (ticks / 48000) * pxPerSec;
  const seekFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.round(((e.clientX - r.left) / pxPerSec) * fps) * (48000 / fps);
    studio.set({ time: Math.max(0, Math.min(scene.duration - 1, t)), playing: false });
  };
  const selIds = new Set(selection.map((s) => s.id));

  return (
    <section className="st-timeline" aria-label="Timeline">
      <div className="st-tl-toolbar" role="toolbar" aria-label="Transport">
        <IconButton label="Back to start" shortcut="Home" icon={<SkipBack size={15} />} onClick={() => studio.set({ time: 0, playing: false })} />
        <button type="button" className="st-play" aria-label={playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space" onClick={() => studio.set({ playing: !playing })}>{playing ? <PauseFilled /> : <PlayFilled />}</button>
        <span className="fr-mono st-timecode" aria-live="off">{formatTimecode(time)} / {formatTimecode(scene.duration)}</span>
        <span className="fr-spacer" />
        <Button
          icon={<Sparkles size={13} />}
          loading={autoBusy}
          disabled={!scene.instances.some((i) => i.kind === 'character')}
          disabledReason="Add a character first"
          title="Generate talking gestures and listening reactions as editable clips (characters with automatic behaviour on)"
          onClick={() => {
            setAutoBusy(true);
            api.autoPerformance(pid, scene.id, { kinds: ['talking', 'listening'] })
              .then((r) => toasts.show({ tone: 'success', message: r.added ? `Added ${r.added} automatic clips${r.removed ? ` (replaced ${r.removed})` : ''}. Undo removes them.` : 'No lines to perform yet.' }))
              .catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))
              .finally(() => setAutoBusy(false));
          }}
        >Auto performance</Button>
        <Button
          icon={<Volume2 size={13} />}
          title="Add sound cues for actions and prop states as editable sound clips"
          onClick={() => api.soundCues(pid, scene.id).then((r) => toasts.show({ tone: 'success', message: r.cues ? `${r.cues} sound cues on the Sound track` : 'No actions with sounds yet.' })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}
        >Sound cues</Button>
        <Button
          icon={<Video size={13} />}
          title="Generate editable shots from the dialogue: an establishing wide, speaker close-ups and reactions"
          onClick={() => api.coverage(pid, scene.id).then((r) => toasts.show({ tone: 'success', message: `${r.shots} shots on the Shot track. Undo removes them.` })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}
        >Auto coverage</Button>
        <div style={{ width: 170 }}><SearchField label="Filter tracks" placeholder="Filter tracks" value={q} onChange={setQ} /></div>
        <Segmented label="Track filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'picture', label: 'Picture' }, { value: 'audio', label: 'Audio' }]} />
        <div style={{ width: 220 }}><SliderRow inline label="Zoom" value={pxPerSec} min={10} max={300} defaultValue={60} format={(v) => `${Math.round(v)}`} onChange={(v) => setPx(v)} /></div>
      </div>
      <div className="st-tl-body" ref={scroller}>
        <div className="st-tl-grid" style={{ width: HEADER + width }}>
          <div className="st-tl-ruler-row">
            <div className="st-tl-corner" style={{ width: HEADER }} />
            <div className="st-tl-ruler" style={{ width }} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekFromEvent(e); }} onPointerMove={(e) => e.buttons & 1 && seekFromEvent(e)} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={scene.duration / 48000} aria-valuenow={time / 48000} aria-valuetext={formatTimecode(time)} tabIndex={0}>
              {ticksFor(scene.duration, pxPerSec).map((s) => <span key={s} className="st-tick" style={{ left: s * pxPerSec }}>{s % 60 === 0 && s >= 60 ? `${s / 60}:00` : `${s}s`}</span>)}
              {scene.markers.map((m) => <span key={m.id} className="st-marker" style={{ left: x(m.at) }} title={m.name} />)}
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
                      onPointerDown={(e) => { if (e.target === e.currentTarget) { seekFromEvent(e); studio.set({ selection: [] }); } }}
                      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) && (t.kind === 'face' || t.kind === 'acting')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                      onDrop={(e) => {
                        const raw = e.dataTransfer.getData(DRAG_TYPE);
                        if (!raw) return;
                        e.preventDefault();
                        const h = JSON.parse(raw) as Hit;
                        if ((t.kind === 'face' && h.kind !== 'exp') || (t.kind === 'acting' && h.kind !== 'act')) {
                          studio.set({ lastError: { message: t.kind === 'face' ? 'Only expressions go on the Face lane.' : 'Only actions go on the Acting lane.' } });
                          return;
                        }
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const at = Math.max(0, Math.round(((e.clientX - r.left) / pxPerSec) * fps) * (48000 / fps));
                        void placeAsset(studio, h, { at, character: t.owner });
                      }}
                    >
                      {t.kind === 'lipsync' ? <LipLane project={project} scene={scene} owner={t.owner} x={x} /> : scene.clips.filter((c) => c.track === t.id).map((c) => <ClipChip key={c.id} project={project} scene={scene} clip={c} track={t} x={x} pxPerSec={pxPerSec} selected={selIds.has(c.id)} conflict={conflicts.has(c.id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="st-playhead" style={{ left: HEADER + x(time) }} aria-hidden />
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

function TrackHeader({ scene, track }: { scene: Scene; track: Track }) {
  const { studio } = useCtx();
  const set = (patch: Partial<Track>) => void studio.exec([{ name: 'track.update', params: { scene: scene.id, id: track.id, set: patch } }]);
  const audio = AUDIO.has(track.kind) && track.kind !== 'lipsync';
  return (
    <div className="st-tl-head" style={{ width: HEADER }}>
      <span className="st-tl-name st-tl-name--lane">{track.name}</span>
      <span className="fr-spacer" />
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
  const [drag, setDrag] = useState<{ x0: number; dx: number } | null>(null);
  const fps = project.project.frameRate;
  const state = clip.line ? lineTakeState(project, clip) : undefined;
  const invalid = conflict || state === 'Missing' || state === 'Failed' || state === 'Outdated';
  const generating = state === 'Generating' || state === 'Queued';
  const muted = clip.line?.muted || !clip.enabled;
  const label = clipLabel(project, scene, clip, track);
  // Changes made by agents stay visible to people (FR-AGT-04/05, AC-13).
  const agent = clip.source?.startsWith('agent:') ? clip.source.slice(6) : undefined;
  const commitMove = () => {
    if (!drag) return;
    const dt = Math.round((drag.dx / pxPerSec) * fps) * (48000 / fps);
    setDrag(null);
    if (dt === 0 || track.lock) return;
    void studio.exec([{ name: 'clip.move', params: { scene: scene.id, ids: [clip.id], delta: Math.max(-clip.start, dt) } }], `Move ${label.slice(0, 24)}`);
  };
  return (
    <button
      type="button"
      className={`fr-clip st-cat--${CATEGORY[track.kind]} ${selected ? 'fr-clip--selected' : ''} ${invalid ? 'fr-clip--invalid' : ''} ${generating ? 'fr-clip--generating' : ''} ${muted ? 'fr-clip--muted' : ''}`}
      style={{ left: x(clip.start) + (drag?.dx ?? 0), width: Math.max(4, x(clip.end - clip.start)) }}
      title={`${label}${state ? ` · ${state}` : ''}${conflict ? ' · In conflict (see Problems)' : ''}${agent ? ` · added by agent ${agent}` : ''}`}
      aria-pressed={selected}
      aria-label={`${track.name}: ${label}${state ? `, ${state}` : ''}${conflict ? ', in conflict' : ''}${agent ? ', added by an agent' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        studio.set({ selection: e.shiftKey ? [...studio.state.selection, { kind: 'clip', id: clip.id }] : [{ kind: 'clip', id: clip.id }] });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ x0: e.clientX, dx: 0 });
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
      {conflict && <AlertTriangle size={11} aria-hidden className="st-agent-mark" />}
      {agent && <Bot size={11} aria-hidden className="st-agent-mark" />}
      {generating ? 'Generating · ' : ''}{label}
    </button>
  );
}

/** Lip-sync lane (Design System §6.2): mouth-shape blocks from each line's chosen take, letter in mono 9 px. */
function LipLane({ project, scene, owner, x }: { project: ProjectState; scene: Scene; owner: string; x: (t: number) => number }) {
  const dlg = scene.tracks.find((t) => t.owner === owner && t.kind === 'dialogue');
  const blocks: { start: number; end: number; shape: string; key: string }[] = [];
  for (const c of scene.clips) {
    if (c.track !== dlg?.id || !c.line?.take) continue;
    const take = project.takes[c.line.take];
    if (!take?.alignment || lineTakeState(project, c) !== 'Ready') continue;
    const mt = mouthTrackFromAlignment(take.alignment, { fps: project.project.frameRate });
    for (const [i, b] of mt.blocks.entries()) blocks.push({ start: c.start + b.start * 48000, end: c.start + b.end * 48000, shape: b.shape, key: `${c.id}:${i}` });
  }
  return <>{blocks.map((b) => <span key={b.key} className="st-mouth" style={{ left: x(b.start), width: Math.max(1, x(b.end - b.start)) }} title={`Mouth ${b.shape}`}>{x(b.end - b.start) > 9 ? b.shape : ''}</span>)}</>;
}
