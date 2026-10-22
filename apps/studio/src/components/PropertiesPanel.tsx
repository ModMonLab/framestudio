/** Properties panel (Design System §7.1): Properties / Acting / Audio tabs with collapsible sections. */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Plus, Sparkles, Upload, UserCog } from 'lucide-react';
import { lineTakeState, trackFor, type ProjectState } from '@frame/core';
import type { Clip, Instance, Scene, Take } from '@frame/schema';
import { Button, Chip, EmptyState, IconButton, NumberField, Panel, Section, Select, SliderRow, StatusBadge, Tabs, TextArea, ToggleRow, useSectionState, type EditPhase } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio, type Mode } from '../lib/store.js';
import { useCtx } from './Workspace.js';
import { RangeDialog } from './RangeDialog.js';

type Tab = 'properties' | 'acting' | 'audio';
const DEFAULT_TAB: Record<Mode, Tab> = { stage: 'properties', direct: 'acting', edit: 'audio' };

export function PropertiesPanel({ mode }: { mode: Mode }) {
  const { studio } = useCtx();
  const [tab, setTab] = useState<Tab>(DEFAULT_TAB[mode]);
  useEffect(() => setTab(DEFAULT_TAB[mode]), [mode]);
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const selection = useStudio(studio, (s) => s.selection);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const first = selection[0];
  const inst = first?.kind === 'instance' ? scene?.instances.find((i) => i.id === first.id) : undefined;
  const clip = first?.kind === 'clip' ? scene?.clips.find((c) => c.id === first.id) : undefined;
  const owner = inst ?? (clip ? scene?.instances.find((i) => i.id === scene.tracks.find((t) => t.id === clip.track)?.owner) : undefined);

  return (
    <Panel label="Properties" className="st-right">
      <Tabs label="Properties tabs" value={tab} onChange={setTab} tabs={[{ value: 'properties', label: 'Properties' }, { value: 'acting', label: 'Acting' }, { value: 'audio', label: 'Audio' }]} style={{ padding: '0 8px' }} />
      <div className="st-props-body">
        {!scene ? <EmptyState title="No scene">Add a scene from the Layers panel.</EmptyState>
          : tab === 'properties' ? (inst ? <InstanceProps scene={scene} inst={inst} /> : clip ? <ClipProps scene={scene} clip={clip} /> : <SceneProps scene={scene} />)
          : tab === 'acting' ? (owner?.kind === 'character' ? <ActingProps scene={scene} inst={owner} /> : <EmptyState title="Select a character">Expressions and gestures apply to the selected character at the playhead.</EmptyState>)
          : owner?.kind === 'character' ? <AudioProps scene={scene} inst={owner} clip={clip} project={project} /> : <SceneAudioProps scene={scene} />}
      </div>
    </Panel>
  );
}

function useSections(id: string, defaults: Record<string, boolean>) {
  return useSectionState(`frame.sections.${id}`, defaults);
}

function SceneProps({ scene }: { scene: Scene }) {
  const { studio } = useCtx();
  const [open, toggle] = useSections('scene', { scene: true });
  return (
    <Section title="Scene" open={open.scene!} onToggle={(o) => toggle('scene', o)}>
      <div className="st-grid2">
        <NumberField label="Duration" prefix="Len" unit=" s" precision={2} min={0.5} max={3600} value={scene.duration / 48000} onChange={(v, phase) => phase === 'commit' && void studio.exec([{ name: 'scene.setDuration', params: { id: scene.id, durationS: v, allowTruncate: false } }])} />
      </div>
      <TextArea label="Notes" value={scene.notes} onChange={(v) => void studio.exec([{ name: 'scene.setNotes', params: { id: scene.id, notes: v } }])} rows={3} placeholder="Notes for this scene" />
    </Section>
  );
}

function InstanceProps({ scene, inst }: { scene: Scene; inst: Instance }) {
  const { studio, assets } = useCtx();
  const [open, toggle] = useSections('instance', { transform: true, layer: true, appearance: true });
  const set = (patch: Record<string, unknown>, label?: string) => void studio.exec([{ name: 'instance.update', params: { scene: scene.id, id: inst.id, set: patch } }], label);
  // Number fields preview locally while scrubbing; one command on commit (one undo step).
  const tf = (k: 'x' | 'y' | 'scale' | 'rotation') => (v: number, phase: EditPhase) => phase === 'commit' && set({ transform: { ...inst.transform, [k]: v } }, `Change ${k} of ${inst.name}`);
  const man = inst.asset ? assets.manifest(inst.asset) : undefined;
  const looks = (man?.data as { looks?: { id: string; name: string }[] } | undefined)?.looks ?? [];
  return (
    <>
      <Section title="Transform" open={open.transform!} onToggle={(o) => toggle('transform', o)}>
        <div className="st-grid2">
          <NumberField label="X position" prefix="X" value={inst.transform.x} precision={0} onChange={tf('x')} />
          <NumberField label="Y position" prefix="Y" value={inst.transform.y} precision={0} onChange={tf('y')} />
          <NumberField label="Scale" prefix="S" value={inst.transform.scale} precision={2} step={0.05} min={0.05} max={20} onChange={tf('scale')} />
          <NumberField label="Rotation" prefix="R" unit="°" value={inst.transform.rotation} precision={1} onChange={tf('rotation')} />
        </div>
        <ToggleRow label="Flip horizontally" checked={inst.transform.flipX} onChange={(v) => set({ transform: { ...inst.transform, flipX: v } }, `Flip ${inst.name}`)} />
      </Section>
      <Section title="Layer and depth" open={open.layer!} onToggle={(o) => toggle('layer', o)}>
        <Select label="Depth plane" value={inst.depthPlane} options={scene.stage.depthPlanes.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ depthPlane: v }, `Move ${inst.name} to ${v}`)} />
        <SliderRow label="Opacity" value={Math.round(inst.opacity * 100)} min={0} max={100} defaultValue={100} format={(v) => `${Math.round(v)} %`} onChange={(v, phase) => phase === 'commit' && set({ opacity: v / 100 })} />
        <SliderRow label="Parallax" value={Math.round(inst.parallax * 100)} min={0} max={200} defaultValue={100} format={(v) => `${Math.round(v)} %`} onChange={(v, phase) => phase === 'commit' && set({ parallax: v / 100 })} />
        <ToggleRow label="Visible" checked={inst.visible} onChange={(v) => set({ visible: v })} />
      </Section>
      {inst.kind === 'character' && inst.character && (
        <Section title="Appearance" open={open.appearance!} onToggle={(o) => toggle('appearance', o)}>
          {looks.length > 0 && <Select label="Look" value={inst.character.look} options={looks.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ character: { ...inst.character!, look: v } }, `Change look of ${inst.name}`)} />}
          <Select label="View" value={inst.character.view} options={[{ value: 'front', label: 'Front' }, { value: 'three', label: '¾' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} onChange={(v) => set({ character: { ...inst.character!, view: v } }, `Turn ${inst.name}`)} />
          <Select label="Posture" value={inst.character.posture} options={['standing', 'seated', 'crouched', 'kneeling', 'lying'].map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} onChange={(v) => set({ character: { ...inst.character!, posture: v } }, `${inst.name} posture`)} />
          <ToggleRow label="Idle motion" checked={inst.character.auto.idle} onChange={(v) => set({ character: { ...inst.character!, auto: { ...inst.character!.auto, idle: v } } })} />
          <ToggleRow label="Listening reactions" checked={inst.character.auto.listening} onChange={(v) => set({ character: { ...inst.character!, auto: { ...inst.character!.auto, listening: v } } })} />
          <ToggleRow label="Automatic blinks" checked={inst.character.auto.blinks} onChange={(v) => set({ character: { ...inst.character!, auto: { ...inst.character!.auto, blinks: v } } })} />
          <Button icon={<UserCog size={14} />} onClick={() => (location.hash = `#/p/${encodeURIComponent(studio.state.pid)}/builder/${scene.id}/${inst.id}`)}>Open in builder</Button>
        </Section>
      )}
    </>
  );
}

function ClipProps({ scene, clip }: { scene: Scene; clip: Clip }) {
  const { studio } = useCtx();
  const [open, toggle] = useSections('clip', { timing: true });
  const fps = studio.state.project!.project.frameRate;
  const snap = (s: number) => Math.round(Math.round(s * fps) * (48000 / fps));
  const acting = scene.tracks.find((t) => t.id === clip.track)?.kind === 'acting' && !!clip.asset;
  return (
    <>
    <Section title="Timing" open={open.timing!} onToggle={(o) => toggle('timing', o)}>
      <div className="st-grid2">
        <NumberField label="Start" prefix="In" unit=" s" precision={2} min={0} value={clip.start / 48000} onChange={(v, p) => p === 'commit' && snap(v) !== clip.start && void studio.exec([{ name: 'clip.move', params: { scene: scene.id, ids: [clip.id], delta: snap(v) - clip.start } }])} />
        <NumberField label="Length" prefix="Len" unit=" s" precision={2} min={1 / fps} value={(clip.end - clip.start) / 48000} onChange={(v, p) => p === 'commit' && void studio.exec([{ name: 'clip.trim', params: { scene: scene.id, id: clip.id, edge: 'end', to: clip.start + snap(v) } }])} />
      </div>
      <ToggleRow label="Enabled" checked={clip.enabled} onChange={(v) => void studio.exec([{ name: 'clip.update', params: { scene: scene.id, id: clip.id, set: { enabled: v } } }])} />
    </Section>
    {acting && <MotionProps scene={scene} clip={clip} />}
    </>
  );
}

/** Named pose controls for the pose editor (FR-ACT-10): offsets added to the action at keyframes. */
const POSE_CONTROLS: { key: string; label: string; index?: number; range: number; unit: string }[] = [
  { key: 'head.yaw', label: 'Head turn', range: 45, unit: '°' },
  { key: 'head.pitch', label: 'Head nod', range: 30, unit: '°' },
  { key: 'head.roll', label: 'Head tilt', range: 25, unit: '°' },
  { key: 'spine.pitch', label: 'Lean forward', range: 25, unit: '°' },
  { key: 'spine.roll', label: 'Lean sideways', range: 15, unit: '°' },
  { key: 'shrug', label: 'Shoulders up', range: 1, unit: '' },
  { key: 'armR', index: 1, label: 'Right arm raise', range: 0.8, unit: '' },
  { key: 'armR', index: 2, label: 'Right arm forward', range: 0.8, unit: '' },
  { key: 'armL', index: 1, label: 'Left arm raise', range: 0.8, unit: '' },
  { key: 'armL', index: 2, label: 'Left arm forward', range: 0.8, unit: '' },
];

type PoseKey = { t: number; v: number | number[] };

/** Motion principles (FR-ACT-09) and the advanced pose editor (FR-ACT-10) for an action clip. */
function MotionProps({ scene, clip }: { scene: Scene; clip: Clip }) {
  const { studio } = useCtx();
  const time = useStudio(studio, (s) => s.time);
  const [open, toggle] = useSections('motion', { motion: true, pose: false });
  const [advanced, setAdvanced] = useState(false);
  const set = (params: Record<string, unknown>, label: string) => void studio.exec([{ name: 'clip.update', params: { scene: scene.id, id: clip.id, set: { params } } }], label);
  const pct = (k: string) => Math.round(((clip.params[k] as number | undefined) ?? 0) * 100);
  const u = Math.max(0, Math.min(1, Math.round(((time - clip.start) / Math.max(1, clip.end - clip.start)) * 100) / 100));
  const inside = time >= clip.start && time < clip.end;
  const pose = (clip.params.pose as Record<string, PoseKey[]> | undefined) ?? {};
  const valueAt = (c: (typeof POSE_CONTROLS)[number]) => {
    const keys = pose[c.key] ?? [];
    const k = keys.find((x) => Math.abs(x.t - u) < 0.005);
    const v = k?.v ?? (keys.length ? [...keys].sort((a, b) => Math.abs(a.t - u) - Math.abs(b.t - u))[0]!.v : 0);
    return Array.isArray(v) ? v[c.index ?? 0] ?? 0 : v;
  };
  const setPose = (c: (typeof POSE_CONTROLS)[number], value: number) => {
    const keys = [...(pose[c.key] ?? [])].filter((k) => Math.abs(k.t - u) >= 0.005);
    const prev = (pose[c.key] ?? []).find((k) => Math.abs(k.t - u) < 0.005)?.v;
    const v: number | number[] = c.index === undefined ? value : (() => { const a = Array.isArray(prev) ? [...prev] : [0, 0, 0]; a[c.index!] = value; return a; })();
    keys.push({ t: u, v });
    keys.sort((a, b) => a.t - b.t);
    set({ pose: { ...pose, [c.key]: keys } }, `Pose: ${c.label}`);
  };
  const keyed = Object.values(pose).some((ks) => ks.some((k) => Math.abs(k.t - u) < 0.005));
  return (
    <>
      <Section title="Motion" open={open.motion!} onToggle={(o) => toggle('motion', o)}>
        <SliderRow label="Anticipation" value={pct('anticipation')} defaultValue={0} format={(v) => `${Math.round(v)}%`} onChange={(v, p) => p === 'commit' && set({ anticipation: v / 100 }, 'Anticipation')} />
        <SliderRow label="Overshoot" value={pct('overshoot')} defaultValue={0} format={(v) => `${Math.round(v)}%`} onChange={(v, p) => p === 'commit' && set({ overshoot: v / 100 }, 'Overshoot')} />
        <SliderRow label="Squash and stretch" value={pct('squash')} defaultValue={0} format={(v) => `${Math.round(v)}%`} onChange={(v, p) => p === 'commit' && set({ squash: v / 100 }, 'Squash and stretch')} />
        <ToggleRow label="Pose editor (advanced)" checked={advanced} onChange={setAdvanced} />
      </Section>
      {advanced && (
        <Section title="Pose" summary={inside ? `${Math.round(u * 100)}% through${keyed ? ' · key' : ''}` : 'Move the playhead into the clip'} open={open.pose ?? true} onToggle={(o) => toggle('pose', o)}>
          {POSE_CONTROLS.map((c) => (
            <SliderRow key={`${c.key}${c.index ?? ''}`} label={c.label} disabled={!inside} value={valueAt(c)} min={-c.range} max={c.range} step={c.range / 100} defaultValue={0} format={(v) => `${c.unit ? Math.round(v) : v.toFixed(2)}${c.unit}`} onChange={(v, p) => p === 'commit' && setPose(c, v)} />
          ))}
          <Button disabled={!Object.keys(pose).length} disabledReason="No pose keys on this clip" onClick={() => set({ pose: null }, 'Clear pose keys')}>Clear pose keys</Button>
        </Section>
      )}
    </>
  );
}

function ActingProps({ scene, inst }: { scene: Scene; inst: Instance }) {
  const { studio } = useCtx();
  const pid = useStudio(studio, (s) => s.pid);
  const [open, toggle] = useSections('acting', { expression: true, gesture: true, objects: true });
  const [exps, setExps] = useState<{ ref: string; name: string }[]>([]);
  const [acts, setActs] = useState<{ ref: string; name: string }[]>([]);
  const [objects, setObjects] = useState<{ prop: string; name: string; actions: { ref: string; name: string; durationS: number }[] }[]>([]);
  const propIds = scene.instances.filter((i) => i.kind === 'prop').map((i) => i.id).join(',');
  useEffect(() => {
    api.library('', 'exp', pid, 500).then((r) => setExps(r.results)).catch(() => undefined);
    api.library('', 'act', pid, 500).then((r) => setActs(r.results)).catch(() => undefined);
  }, [pid]);
  useEffect(() => {
    api.interactions(pid, scene.id).then((r) => setObjects(r.props)).catch(() => undefined);
  }, [pid, scene.id, propIds]);
  const time = useStudio(studio, (s) => s.time);
  const add = (kind: 'face' | 'acting', ref: string, name: string) => {
    const track = trackFor(scene, inst.id, kind);
    if (!track) return;
    void studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: time, end: Math.min(scene.duration, time + 96000), asset: ref, blendIn: 4800, blendOut: 4800 } }], `${name} for ${inst.name}`);
  };
  const activeAt = (kind: 'face' | 'acting') => {
    const track = trackFor(scene, inst.id, kind);
    return scene.clips.find((c) => c.track === track?.id && c.start <= time && time < c.end)?.asset;
  };
  // Using an object (FR-ACT-06, FR-PRP-02): the clip binds to the prop; its sound cues are regenerated (FR-SND-04).
  const use = async (prop: string, a: { ref: string; name: string; durationS: number }, propName: string) => {
    const track = trackFor(scene, inst.id, 'acting');
    if (!track) return;
    const end = Math.min(scene.duration, time + Math.round(a.durationS * 48000));
    const r = await studio.exec([{ name: 'clip.add', params: { scene: scene.id, track: track.id, start: time, end, asset: a.ref, params: { prop }, blendIn: 2400, blendOut: 2400 } }], `${a.name} (${propName}) for ${inst.name}`);
    if (r) await api.soundCues(pid, scene.id).catch(() => undefined);
  };
  const curExp = activeAt('face');
  const curAct = activeAt('acting');
  const common = ['smile', 'laugh', 'surprised', 'sad', 'skeptical', 'embarrassed', 'angry', 'thinking', 'worried', 'neutral'];
  const shownExp = [...exps].sort((a, b) => rank(a.ref, common) - rank(b.ref, common)).slice(0, 18);
  return (
    <>
      <Section title="Expression" summary={exps.find((e) => e.ref === curExp)?.name ?? 'Base'} open={open.expression!} onToggle={(o) => toggle('expression', o)}>
        <p className="fr-hint">Adds a 2 s expression clip at the playhead for {inst.name}.</p>
        <div className="fr-chips">{shownExp.map((e) => <Chip key={e.ref} selected={e.ref === curExp} onClick={() => add('face', e.ref, e.name)}>{e.name}</Chip>)}</div>
        {exps.length > shownExp.length && <p className="fr-faint">{exps.length - shownExp.length} more in Assets → Expressions</p>}
      </Section>
      <Section title="Gesture" summary={acts.find((a) => a.ref === curAct)?.name ?? 'None'} open={open.gesture!} onToggle={(o) => toggle('gesture', o)}>
        <div className="fr-chips">{acts.slice(0, 24).map((a) => <Chip key={a.ref} selected={a.ref === curAct} onClick={() => add('acting', a.ref, a.name)}>{a.name}</Chip>)}</div>
      </Section>
      <Section title="Use an object" summary={objects.length ? `${objects.length} in scene` : 'None'} open={open.objects!} onToggle={(o) => toggle('objects', o)}>
        {!objects.length ? <p className="fr-hint">Add a prop that can be used (a mug, a phone, a door) to the scene.</p> : objects.map((o) => (
          <div key={o.prop} className="st-field-col">
            <span className="fr-label">{o.name}</span>
            <div className="fr-chips" role="group" aria-label={`Use ${o.name}`}>{o.actions.map((a) => <Chip key={a.ref} onClick={() => void use(o.prop, a, o.name)}>{a.name}</Chip>)}</div>
          </div>
        ))}
      </Section>
    </>
  );
}

function rank(ref: string, common: string[]) {
  const id = ref.split('@')[0]!.split('.')[1]!;
  const i = common.indexOf(id);
  return i < 0 ? 100 : i;
}

/* ------------------------------------------------------------------ audio */

function SceneAudioProps({ scene }: { scene: Scene }) {
  const { studio } = useCtx();
  const [open, toggle] = useSections('sceneaudio', { mix: true });
  const set = (patch: Record<string, number>) => void studio.exec([{ name: 'scene.setAudio', params: { id: scene.id, ...patch } }]);
  return (
    <Section title="Mix" open={open.mix!} onToggle={(o) => toggle('mix', o)}>
      <SliderRow label="Duck music under dialogue" value={scene.audio.duckingDb} min={-40} max={0} defaultValue={-12} format={(v) => `${v} dB`} onChange={(v, p) => p === 'commit' && set({ duckingDb: v })} />
      <p className="fr-hint">Select a character to manage its voice and lines.</p>
    </Section>
  );
}

function AudioProps({ scene, inst, clip, project }: { scene: Scene; inst: Instance; clip?: Clip; project: ProjectState }) {
  const { studio, openVoiceDesigner, assets } = useCtx();
  const pid = useStudio(studio, (s) => s.pid);
  const time = useStudio(studio, (s) => s.time);
  const jobs = useStudio(studio, (s) => s.jobs);
  const [open, toggle] = useSections('audio', { voice: true, line: true, delivery: true });
  const [worker, setWorker] = useState<WorkerStatus>();
  const [count, setCount] = useState(2);
  const [newLine, setNewLine] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  useEffect(() => {
    api.worker(pid).then(setWorker).catch(() => undefined);
  }, [pid]);
  const dlg = trackFor(scene, inst.id, 'dialogue');
  const lines = scene.clips.filter((c) => c.track === dlg?.id && c.line).sort((a, b) => a.start - b.start);
  const line = (clip?.line ? clip : undefined) ?? lines.find((c) => c.start <= time && time < c.end) ?? lines.find((c) => c.start >= time) ?? lines.at(-1);
  const voiceRef = inst.character?.voice;
  const voiceName = voiceRef ? project.assets[voiceRef]?.name ?? assets.manifest(voiceRef)?.name : undefined;
  const takes = line ? Object.values(project.takes).filter((t) => t.line === line.id).sort((a, b) => b.number - a.number) : [];
  const state = line ? lineTakeState(project, line) : undefined;
  const generating = Object.values(jobs).some((j) => j.kind === 'takes.generate' && (j.state === 'queued' || j.state === 'running'));
  const workerOk = worker?.state === 'connected' || worker?.state === 'busy';
  const engine = worker?.capabilities?.engines[0];

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    if (!line) return;
    try {
      await api.uploadTake(pid, scene.id, line.id, f);
    } catch (e) {
      studio.set({ lastError: { message: (e as Error).message } });
    }
  };
  const generate = async () => {
    if (!line) return;
    try {
      await api.generateTakes(pid, { scene: scene.id, lines: [line.id], takes: count });
    } catch (e) {
      studio.set({ lastError: { message: (e as Error).message } });
    }
  };
  const addLine = async () => {
    if (!newLine.trim()) return;
    const r = await studio.exec([{ name: 'line.add', params: { scene: scene.id, speaker: inst.id, text: newLine.trim(), start: time } }], `Add line for ${inst.name}`);
    if (r) {
      setNewLine('');
      const id = (r.commands[0]?.params as { id?: string }).id;
      if (id) studio.set({ selection: [{ kind: 'clip', id }] });
    }
  };

  return (
    <>
      <Section title="Voice" summary={voiceName ?? 'None'} open={open.voice!} onToggle={(o) => toggle('voice', o)}>
        {voiceName ? <p><b>{voiceName}</b></p> : <p className="fr-hint">{inst.name} has no voice yet.</p>}
        <div className="st-row">
          <Button icon={<Sparkles size={14} />} onClick={() => openVoiceDesigner(inst.id)}>{voiceName ? 'Design another voice…' : 'Design a voice…'}</Button>
          {voiceRef && <Button disabled={!project.assets[voiceRef]} disabledReason="Only voices designed in this project can be extended" onClick={() => setRangeOpen(true)}>Emotional range…</Button>}
        </div>
        {voiceRef && project.assets[voiceRef] && <p className="fr-faint">Emotions: {((project.assets[voiceRef]!.data as { references: { emotion: string; accepted: boolean }[] }).references.filter((r) => r.accepted).map((r) => r.emotion).join(', '))} · version {project.assets[voiceRef]!.version}</p>}
        {voiceRef && <RangeDialog voice={voiceRef} open={rangeOpen} onClose={() => setRangeOpen(false)} />}
      </Section>
      <Section title="Current line" summary={state} open={open.line!} onToggle={(o) => toggle('line', o)}>
        {line?.line ? (
          <>
            <LineText key={`${line.id}:${line.line.revision}`} scene={scene} clip={line} />
            <div className="st-row">
              <StatusBadge tone={state === 'Ready' ? 'success' : state === 'Generating' || state === 'Queued' ? 'info' : state === 'Muted' ? 'neutral' : 'warning'}>{state}</StatusBadge>
              <span className="fr-faint">{(line.start / 48000).toFixed(2)} s · {((line.end - line.start) / 48000).toFixed(2)} s</span>
            </div>
            <ul className="st-takes" aria-label="Takes">
              {takes.map((t) => <TakeRow key={t.id} take={t} chosen={line.line!.take === t.id} current={t.lineRevision === line.line!.revision} onChoose={() => void studio.exec([{ name: 'line.chooseTake', params: { scene: scene.id, id: line.id, take: t.id } }], `Choose take ${t.number}`)} />)}
              {takes.length === 0 && <li className="fr-faint">No takes yet.</li>}
            </ul>
            <div className="st-row">
              <Select label="Number of takes" value={String(count)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} take${n > 1 ? 's' : ''}` }))} onChange={(v) => setCount(Number(v))} />
              <Button variant="primary" loading={generating} disabled={!workerOk || !voiceRef || line.line.muted} disabledReason={!voiceRef ? `Design a voice for ${inst.name} first` : !workerOk ? worker?.hint ?? worker?.message ?? 'The voice worker is not connected' : 'This line is muted'} onClick={() => void generate()}>Generate takes</Button>
            </div>
            {worker?.fixture && <p className="fr-hint">The connected worker produces fixture audio — not real speech.</p>}
            <input ref={fileRef} type="file" accept=".wav,.mp3,.flac,.ogg,.m4a,.aac,.webm,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            <Button icon={<Upload size={14} />} disabled={line.line.muted} disabledReason="This line is muted" onClick={() => fileRef.current?.click()}>Upload take…</Button>
          </>
        ) : <p className="fr-hint">{inst.name} has no lines in this scene.</p>}
        <TextArea label="New line" value={newLine} onChange={setNewLine} rows={2} placeholder={`New line for ${inst.name}`} />
        <Button icon={<Plus size={14} />} disabled={!newLine.trim()} disabledReason="Type the line first" onClick={() => void addLine()}>Add line at playhead</Button>
      </Section>
      {line?.line && (
        <Section title="Delivery" summary={line.line.delivery.emotion ?? 'Neutral'} open={open.delivery!} onToggle={(o) => toggle('delivery', o)}>
          {engine ? (
            <Select label="Emotion" value={line.line.delivery.emotion ?? 'neutral'} options={engine.controls.emotion.map((e) => ({ value: e, label: e[0]!.toUpperCase() + e.slice(1) }))} onChange={(v) => void studio.exec([{ name: 'line.setDelivery', params: { scene: scene.id, id: line.id, delivery: { ...line.line!.delivery, emotion: v } } }])} />
          ) : <p className="fr-hint">Delivery options appear when the voice worker is connected (they depend on its engine).</p>}
          {engine && !engine.controls.pace && <p className="fr-faint">Pace is not supported by {engine.label}.</p>}
          {engine && !engine.controls.instruction && <p className="fr-faint">Instruction text is not supported by {engine.label}.</p>}
        </Section>
      )}
    </>
  );
}

function LineText({ scene, clip }: { scene: Scene; clip: Clip }) {
  const { studio } = useCtx();
  const [text, setText] = useState(clip.line!.text);
  const commit = () => {
    if (text.trim() && text !== clip.line!.text) void studio.exec([{ name: 'line.setText', params: { scene: scene.id, id: clip.id, text: text.trim() } }], 'Edit line');
  };
  return (
    <div onBlur={commit}>
      <TextArea label="Line" value={text} onChange={setText} rows={3} />
    </div>
  );
}

function TakeRow({ take, chosen, current, onChoose }: { take: Take; chosen: boolean; current: boolean; onChoose: () => void }) {
  const { studio } = useCtx();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!take.media) return;
    if (!audio.current) {
      audio.current = new Audio(api.mediaUrl(studio.state.pid, take.media.hash));
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audio.current.pause();
      audio.current.currentTime = 0;
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };
  useEffect(() => () => audio.current?.pause(), []);
  return (
    <li className={`st-take ${chosen ? 'st-take--chosen' : ''}`}>
      <IconButton size="sm" label={playing ? `Stop take ${take.number}` : `Play take ${take.number}`} icon={playing ? <Pause size={13} /> : <Play size={13} />} disabled={!take.media} disabledReason={take.status === 'generating' ? 'Still generating' : 'No audio'} onClick={toggle} />
      <span>Take {take.number}</span>
      <span className="fr-faint">{take.status === 'ready' ? `${(take.durationS ?? 0).toFixed(1)} s` : take.status === 'generating' ? 'Generating…' : take.status === 'failed' ? `Failed: ${take.error?.message ?? ''}` : take.status}</span>
      {!current && <StatusBadge tone="warning">Previous text</StatusBadge>}
      {take.fixture && <StatusBadge tone="neutral" title="Fixture audio — not real speech">Fixture</StatusBadge>}
      <span className="fr-spacer" />
      {take.status === 'ready' && current && (chosen ? <StatusBadge tone="success">Chosen</StatusBadge> : <Button variant="ghost" onClick={onChoose}>Use</Button>)}
    </li>
  );
}
