/**
 * Playback (FR-RND-03, SRS §2.3 Audio): the playhead advances in real time; audio plays through Web Audio using the
 * same plan and gain automation (fades, pan, ducking) as the offline export mix.
 */
import { useEffect } from 'react';
import { eventGainAt, panGains, scheduleSceneAudio, TICKS_PER_SECOND, type AudioPlan } from '@frame/core';
import { api } from './api.js';
import { useStudio } from './store.js';
import { useCtx } from '../components/Workspace.js';

const buffers = new Map<string, Promise<AudioBuffer | null>>();
let actx: AudioContext | undefined;

function ctx(): AudioContext {
  actx ??= new AudioContext({ sampleRate: 48000 });
  return actx;
}

function load(pid: string, hash: string): Promise<AudioBuffer | null> {
  let p = buffers.get(hash);
  if (!p) {
    p = fetch(api.mediaUrl(pid, hash)).then((r) => r.arrayBuffer()).then((b) => ctx().decodeAudioData(b)).catch(() => null);
    buffers.set(hash, p);
  }
  return p;
}

/** Starts audio for a plan from plan time t0; returns a stop function. */
export async function playPlan(pid: string, plan: AudioPlan, t0: number): Promise<() => void> {
  const ac = ctx();
  if (ac.state === 'suspended') await ac.resume();
  const now = ac.currentTime + 0.05;
  const nodes: AudioScheduledSourceNode[] = [];
  for (const e of plan.events) {
    if (e.start + e.duration <= t0 || e.source.kind !== 'media') continue;
    const buf = await load(pid, e.source.hash);
    if (!buf) continue;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = e.loop;
    const gain = ac.createGain();
    const [l, r] = panGains(e.pan);
    const pan = ac.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (r - l) / Math.SQRT2));
    // Gain automation sampled at 100 Hz from the shared plan functions.
    const from = Math.max(t0, e.start);
    const to = e.start + e.duration;
    const n = Math.max(2, Math.ceil((to - from) * 100));
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = eventGainAt(plan, e, from + ((to - from) * i) / (n - 1));
    gain.gain.setValueCurveAtTime(curve, now + (from - t0), Math.max(0.01, to - from));
    src.connect(gain).connect(pan).connect(ac.destination);
    const offset = e.offset + (from - e.start);
    src.start(now + (from - t0), e.loop ? offset % buf.duration : offset, e.loop ? undefined : Math.max(0, to - from));
    if (e.loop) src.stop(now + (to - t0));
    nodes.push(src);
  }
  return () => {
    for (const s of nodes) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
  };
}

export function usePlayback() {
  const { studio } = useCtx();
  const playing = useStudio(studio, (s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    const s = studio.state;
    const scene = s.scene ? s.project?.scenes[s.scene] : undefined;
    if (!scene) return;
    const start = s.time >= scene.duration - 1 ? 0 : s.time;
    const t0 = performance.now();
    let raf = 0;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const plan = scheduleSceneAudio(s.project!, scene);
    void playPlan(s.pid, plan, start / TICKS_PER_SECOND).then((fn) => (cancelled ? fn() : (stop = fn)));
    const tick = () => {
      const t = start + Math.round(((performance.now() - t0) / 1000) * TICKS_PER_SECOND);
      const end = scene.loop ? scene.loop.end : scene.duration;
      if (t >= end) {
        if (scene.loop) {
          // Loop range: restart playback (and audio) from the loop start.
          studio.set({ time: scene.loop.start, playing: false });
          queueMicrotask(() => studio.set({ playing: true }));
          return;
        } else {
          studio.set({ time: scene.duration - 1, playing: false });
          return;
        }
      } else studio.set({ time: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop?.();
    };
  }, [playing, studio]);
}
