/** Voice designer (FR-VOI-02): description + test line → candidates on the worker → audition → save as a voice. */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button, Dialog, IconButton, Progress, Select, StatusBadge, TextArea, TextField, useToasts } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Candidate {
  media: { hash: string; ext: string; mime: string; bytes: number; durationS?: number };
  seed: number | null;
  durationS: number;
  fixture: boolean;
}

const DEFAULT_LINE = 'Thanks for listening to the show today. We read every message you send, even the strange ones.';

export function VoiceDesigner({ open, instance, onClose }: { open: boolean; instance?: string; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const jobs = useStudio(studio, (s) => s.jobs);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const inst = instance ? scene?.instances.find((i) => i.id === instance) : undefined;
  const [description, setDescription] = useState('');
  const [line, setLine] = useState(DEFAULT_LINE);
  const [count, setCount] = useState('4');
  const [jobId, setJobId] = useState<string>();
  const [picked, setPicked] = useState<number>();
  const [name, setName] = useState('');
  const [assign, setAssign] = useState<string>(instance ?? '');
  const [worker, setWorker] = useState<WorkerStatus>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssign(instance ?? '');
    setName(inst ? `${inst.name} voice` : '');
    setJobId(undefined);
    setPicked(undefined);
    api.worker(pid).then(setWorker).catch(() => undefined);
  }, [open, instance, inst, pid]);

  const job = jobId ? jobs[jobId] : undefined;
  const candidates = (job?.state === 'succeeded' ? (job.result as { candidates: Candidate[] }).candidates : []) ?? [];
  const minRef = worker?.capabilities?.limits.minRefSeconds ?? 3;
  const workerOk = worker?.state === 'connected' || worker?.state === 'busy';
  const generate = async () => {
    try {
      const j = await api.designVoice(pid, { description, sampleText: line, candidates: Number(count) });
      setJobId(j.id);
      setPicked(undefined);
      studio.set({ jobs: { ...studio.state.jobs, [j.id]: j } });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const save = async () => {
    const c = picked !== undefined ? candidates[picked] : undefined;
    if (!c) return;
    setSaving(true);
    try {
      await api.saveVoice(pid, { name, description, sampleText: line, candidate: c, ...(assign && sceneId ? { assignTo: [{ scene: sceneId, instance: assign }] } : {}) });
      toasts.show({ tone: 'success', message: `Saved ${name}.` });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const chars = scene?.instances.filter((i) => i.kind === 'character') ?? [];
  const chosen = picked !== undefined ? candidates[picked] : undefined;

  return (
    <Dialog title="Design a voice" open={open} onClose={onClose} wide footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={saving} disabled={!chosen || !name.trim() || (chosen?.durationS ?? 0) < minRef} disabledReason={!chosen ? 'Choose a candidate' : !name.trim() ? 'Name the voice' : `This candidate is shorter than ${minRef} s; use a longer test line`} onClick={() => void save()}>Save voice</Button>
    </>}>
      <div className="st-form">
        {!workerOk && <p role="alert" className="fr-error-text">{worker?.message ?? 'The voice worker is not connected.'} {worker?.hint ?? ''}</p>}
        <TextArea label="Description" value={description} onChange={setDescription} rows={3} placeholder="Age, timbre, accent, energy and character notes, e.g. warm radio host in her thirties, relaxed pace" />
        <TextArea label="Test line" value={line} onChange={setLine} rows={2} />
        <div className="st-row">
          <Select label="Candidates" value={count} options={['2', '4', '6'].map((n) => ({ value: n, label: `${n} candidates` }))} onChange={setCount} />
          <Button variant="primary" disabled={!workerOk || description.trim().length < 3 || !line.trim()} disabledReason={!workerOk ? 'The voice worker is not connected' : 'Describe the voice and enter a test line'} loading={job?.state === 'running' || job?.state === 'queued'} onClick={() => void generate()}>{candidates.length ? 'Generate again' : 'Generate candidates'}</Button>
        </div>
        {job && (job.state === 'running' || job.state === 'queued') && <Progress value={job.progress} label={job.message || 'Designing voice'} />}
        {job?.state === 'failed' && <p className="fr-error-text" role="alert">{job.error?.message}</p>}
        {candidates.length > 0 && (
          <ul className="st-takes" aria-label="Candidates">
            {candidates.map((c, i) => <CandidateRow key={c.media.hash} pid={pid} c={c} index={i} picked={picked === i} onPick={() => setPicked(i)} />)}
          </ul>
        )}
        {candidates.some((c) => c.fixture) && <p className="fr-hint">These candidates come from the fixture worker: test signals, not real speech.</p>}
        {chosen && (
          <div className="st-grid2">
            <TextField label="Voice name" value={name} onChange={setName} placeholder="Voice name" />
            <Select label="Assign to" value={assign} options={[{ value: '', label: 'Nobody yet' }, ...chars.map((c) => ({ value: c.id, label: c.name }))]} onChange={setAssign} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function CandidateRow({ pid, c, index, picked, onPick }: { pid: string; c: Candidate; index: number; picked: boolean; onPick: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    audio.current ??= Object.assign(new Audio(api.mediaUrl(pid, c.media.hash)), { onended: () => setPlaying(false) });
    if (playing) {
      audio.current.pause();
      audio.current.currentTime = 0;
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };
  return (
    <li className={`st-take ${picked ? 'st-take--chosen' : ''}`}>
      <IconButton size="sm" label={playing ? `Stop candidate ${index + 1}` : `Play candidate ${index + 1}`} icon={playing ? <Pause size={13} /> : <Play size={13} />} onClick={toggle} />
      <span>Candidate {index + 1}</span>
      <span className="fr-faint">{c.durationS.toFixed(1)} s{c.seed !== null ? ` · seed ${c.seed}` : ''}</span>
      {c.fixture && <StatusBadge tone="neutral" title="Fixture audio — not real speech">Fixture</StatusBadge>}
      <span className="fr-spacer" />
      {picked ? <StatusBadge tone="success">Chosen</StatusBadge> : <Button variant="ghost" onClick={onPick}>Choose</Button>}
    </li>
  );
}
