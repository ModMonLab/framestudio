/**
 * Episode view (FR-TML-09): the episode's scenes in order as cards — reorder them, choose the transition into each
 * scene (the first shot's transition, blended from the previous scene's last picture, FR-FX-03), and play the whole
 * episode (FR-TML-05).
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ListVideo, PlayCircle } from 'lucide-react';
import { formatTimecode } from '@frame/core';
import type { Scene } from '@frame/schema';
import { Button, IconButton, Select, t as tt } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

export function EpisodeView() {
  const { studio } = useCtx();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const pid = useStudio(studio, (s) => s.pid);
  const revision = useStudio(studio, (s) => s.revision);
  const [transitions, setTransitions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api.library('', 'tr', pid, 100).then((r) => setTransitions(r.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setTransitions([]));
  }, [pid]);
  const epId = sceneId ? project.sceneEpisode[sceneId] : project.project.episodes[0];
  const ep = epId ? project.episodes[epId] : undefined;
  if (!ep) return null;
  const total = ep.scenes.reduce((n, id) => n + (project.scenes[id]?.duration ?? 0), 0);

  const firstShot = (sc: Scene) => {
    const track = sc.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot');
    return { track, clip: sc.clips.filter((c) => c.track === track?.id && c.start === 0).sort((a, b) => a.end - b.end)[0] };
  };
  // The transition into a scene is its first shot's transition; a scene without a shot at 0 gets one on its default camera.
  const setTransition = (sc: Scene, ref: string) => {
    const { track, clip } = firstShot(sc);
    if (!track) return;
    const params = ref === 'cut' ? { transition: null, transitionS: null } : { transition: ref, transitionS: 0.8 };
    if (clip) void studio.exec([{ name: 'clip.update', params: { scene: sc.id, id: clip.id, set: { params } } }], `Transition into ${sc.name}`);
    else {
      const next = sc.clips.filter((c) => c.track === track.id).sort((a, b) => a.start - b.start)[0]?.start ?? sc.duration;
      void studio.exec([{ name: 'clip.add', params: { scene: sc.id, track: track.id, start: 0, end: Math.max(4800, next), params: { camera: sc.defaultCamera, ...(ref === 'cut' ? {} : { transition: ref, transitionS: 0.8 }) } } }], `Transition into ${sc.name}`);
    }
  };
  const move = (id: string, to: number) => void studio.exec([{ name: 'scene.move', params: { id, episode: ep.id, index: to } }], 'Reorder scenes');

  return (
    <section className="st-timeline st-episode" aria-label={tt('Episode')}>
      <div className="st-tl-toolbar" role="toolbar" aria-label={tt('Episode')}>
        <ListVideo size={15} aria-hidden />
        <b>{ep.name}</b>
        <span className="fr-faint">{ep.scenes.length}  {tt('scenes ·')} {formatTimecode(total)}</span>
        <span className="fr-spacer" />
        <Button icon={<PlayCircle size={14} />} onClick={() => studio.set({ scene: sceneId ?? ep.scenes[0], time: 0, episodePlay: true, playing: true, selection: [] })}>{tt('Play episode')}</Button>
        <Button onClick={() => studio.set({ episodeView: false })}>{tt('Back to timeline')}</Button>
      </div>
      <ol className="st-ep-strip">
        {ep.scenes.map((id, i) => {
          const sc = project.scenes[id];
          if (!sc) return null;
          const tr = firstShot(sc).clip?.params.transition;
          return (
            <li key={id} className={`st-ep-card ${id === sceneId ? 'st-ep-card--current' : ''}`}>
              <div className="st-ep-into">
                <Select label={i === 0 ? `Into ${sc.name} (from black)` : `Into ${sc.name}`} value={typeof tr === 'string' ? tr : 'cut'} onChange={(v) => setTransition(sc, v)} options={[{ value: 'cut', label: 'No transition' }, ...transitions]} />
              </div>
              <button type="button" className="st-ep-thumb" aria-label={`Open ${sc.name}`} aria-current={id === sceneId} onClick={() => studio.set({ scene: id, time: 0, selection: [], episodeView: false })}>
                <img src={`/api/projects/${encodeURIComponent(pid)}/frame?scene=${id}&t=${Math.round(sc.duration / 2)}&width=192&height=108&r=${revision}`} width={192} height={108} alt="" loading="lazy" />
              </button>
              <div className="st-ep-meta">
                <span className="st-ep-num">{i + 1}</span>
                <b className="st-ep-name">{sc.name}</b>
                <span className="fr-faint fr-mono">{formatTimecode(sc.duration)}</span>
                <span className="fr-spacer" />
                <IconButton size="sm" label={`Move ${sc.name} earlier`} icon={<ArrowLeft size={13} />} disabled={i === 0} disabledReason={tt('Already first')} onClick={() => move(id, i - 1)} />
                <IconButton size="sm" label={`Move ${sc.name} later`} icon={<ArrowRight size={13} />} disabled={i === ep.scenes.length - 1} disabledReason={tt('Already last')} onClick={() => move(id, i + 1)} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
