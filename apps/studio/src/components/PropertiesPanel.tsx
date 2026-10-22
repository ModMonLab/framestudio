/** Properties panel (Design System §7.1): Properties / Acting / Audio tabs with collapsible sections. */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Plus, Sparkles, UserCog } from 'lucide-react';
import { lineTakeState, trackFor, type ProjectState } from '@frame/core';
import type { Clip, Instance, Scene, Take } from '@frame/schema';
import { Button, Chip, EmptyState, IconButton, NumberField, Panel, Section, Select, SliderRow, StatusBadge, Tabs, TextArea, ToggleRow, useSectionState, type EditPhase } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio, type Mode } from '../lib/store.js';
import { useCtx } from './Workspace.js';

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
  return (
    <Section title="Timing" open={open.timing!} onToggle={(o) => toggle('timing', o)}>
      <div className="st-grid2">
        <NumberField label="Start" prefix="In" unit=" s" precision={2} min={0} value={clip.start / 48000} onChange={(v, p) => p === 'commit' && void studio.exec([{ name: 'clip.move', params: { scene: scene.id, id: clip.id, start: snap(v) } }])} />
        <NumberField label="Length" prefix="Len" unit=" s" precision={2} min={1 / fps} value={(clip.end - clip.start) / 48000} onChange={(v, p) => p === 'commit' && void studio.exec([{ name: 'clip.trim', params: { scene: scene.id, id: clip.id, end: clip.start + snap(v) } }])} />
      </div>
      <ToggleRow label="Enabled" checked={clip.enabled} onChange={(v) => void studio.exec([{ name: 'clip.update', params: { scene: scene.id, id: clip.id, set: { enabled: v } } }])} />
    </Section>
  );
}

function ActingProps({ scene, inst }: { scene: Scene; inst: Instance }) {
  const { studio } = useCtx();
  const pid = useStudio(studio, (s) => s.pid);
  const [open, toggle] = useSections('acting', { expression: true, gesture: true });
  const [exps, setExps] = useState<{ ref: string; name: string }[]>([]);
  const [acts, setActs] = useState<{ ref: string; name: string }[]>([]);
  useEffect(() => {
    api.library('', 'exp', pid, 500).then((r) => setExps(r.results)).catch(() => undefined);
    api.library('', 'act', pid, 500).then((r) => setActs(r.results)).catch(() => undefined);
  }, [pid]);
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
        <Button icon={<Sparkles size={14} />} onClick={() => openVoiceDesigner(inst.id)}>{voiceName ? 'Design another voice…' : 'Design a voice…'}</Button>
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
