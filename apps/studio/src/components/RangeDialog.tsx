/** Emotional range bank (FR-VOI-03): render emotions from the neutral reference, audition, accept → new voice version (FR-VOI-10). */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button, Chip, Dialog, IconButton, Progress, StatusBadge, Switch, ToggleRow, useToasts, t as tt } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Candidate {
  emotion: string;
  media: { hash: string; ext: string; mime: string; bytes: number; durationS?: number };
  transcript: string;
  seed: number | null;
  durationS: number;
  similarity: number | null;
  fixture: boolean;
}

const DEFAULTS = ['happy', 'sad', 'angry', 'nervous', 'whisper', 'excited', 'deadpan'];

export function RangeDialog({ voice, open, onClose }: { voice: string; open: boolean; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const jobs = useStudio(studio, (s) => s.jobs);
  const project = useStudio(studio, (s) => s.project)!;
  const manifest = project.assets[voice];
  const [worker, setWorker] = useState<WorkerStatus>();
  const [emotions, setEmotions] = useState<string[]>(DEFAULTS);
  const [jobId, setJobId] = useState<string>();
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [updateUsers, setUpdateUsers] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(undefined);
    setAccepted({});
    api.worker(pid).then((w) => {
      setWorker(w);
      const supported = w.capabilities?.engines[0]?.controls.emotion ?? [];
      setEmotions(DEFAULTS.filter((e) => supported.includes(e)));
    }).catch(() => undefined);
  }, [open, pid]);

  const supported = (worker?.capabilities?.engines[0]?.controls.emotion ?? []).filter((e) => e !== 'neutral');
  const job = jobId ? jobs[jobId] : undefined;
  const candidates: Candidate[] = job?.state === 'succeeded' ? (job.result as { candidates: Candidate[] }).candidates : [];
  const workerOk = worker?.state === 'connected' || worker?.state === 'busy';
  const have = new Set(((manifest?.data as { references?: { emotion: string }[] } | undefined)?.references ?? []).map((r) => r.emotion));
  const chosen = candidates.filter((c) => accepted[c.emotion]);

  const generate = async () => {
    try {
      const j = await api.voiceRange(pid, { voice, emotions });
      studio.set({ jobs: { ...studio.state.jobs, [j.id]: j } });
      setJobId(j.id);
      setAccepted({});
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.voiceVersion(pid, { voice, accept: chosen, updateUsers });
      toasts.show({ tone: 'success', message: `Saved ${manifest?.name ?? 'voice'} version ${r.ref.split('@')[1]}${r.updated ? ` and switched ${r.updated} character${r.updated > 1 ? 's' : ''} to it` : ''}.` });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={`Emotional range · ${manifest?.name ?? 'Voice'}`} open={open} onClose={onClose} wide footer={<>
      <Button onClick={onClose}>{tt('Cancel')}</Button>
      <Button variant="primary" loading={saving} disabled={!chosen.length} disabledReason={tt('Accept at least one emotion')} onClick={() => void save()}>{tt('Save as version')} {(manifest?.version ?? 1) + 1}</Button>
    </>}>
      <div className="st-form">
        {!manifest && <p role="alert" className="fr-error-text">{tt('Only voices designed in this project can be extended here.')}</p>}
        {!workerOk && <p role="alert" className="fr-error-text">{worker?.message ?? 'The voice worker is not connected.'} {worker?.hint ?? ''}</p>}
        <p className="fr-hint">{tt('Each emotion is rendered from this voice\'s neutral reference. Accepted references are used when a line\'s delivery asks for that emotion.')}</p>
        <div className="fr-chips" role="group" aria-label={tt('Emotions')}>
          {supported.map((e) => <Chip key={e} selected={emotions.includes(e)} onClick={() => setEmotions((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e]))}>{e[0]!.toUpperCase() + e.slice(1)}{have.has(e) ? ' ✓' : ''}</Chip>)}
        </div>
        <Button variant="primary" disabled={!workerOk || !manifest || !emotions.length} disabledReason={!manifest ? 'Not a project voice' : !workerOk ? 'The voice worker is not connected' : 'Choose at least one emotion'} loading={job?.state === 'running' || job?.state === 'queued'} onClick={() => void generate()}>{candidates.length ? 'Render again' : 'Render emotions'}</Button>
        {job && (job.state === 'running' || job.state === 'queued') && <Progress value={job.progress} label={job.message || 'Rendering emotions'} />}
        {job?.state === 'failed' && <p className="fr-error-text" role="alert">{job.error?.message}</p>}
        {candidates.length > 0 && (
          <ul className="st-takes" aria-label={tt('Emotion references')}>
            {candidates.map((c) => <RangeRow key={c.media.hash} pid={pid} c={c} accepted={!!accepted[c.emotion]} onAccept={(v) => setAccepted((a) => ({ ...a, [c.emotion]: v }))} />)}
          </ul>
        )}
        {candidates.some((c) => c.fixture) && <p className="fr-hint">{tt('These references come from the fixture worker: test signals, not real speech.')}</p>}
        {chosen.length > 0 && <ToggleRow label={tt('Use the new version for characters that use this voice')} description={tt('Existing takes are kept; new takes use the new version.')} checked={updateUsers} onChange={setUpdateUsers} />}
      </div>
    </Dialog>
  );
}

function RangeRow({ pid, c, accepted, onAccept }: { pid: string; c: Candidate; accepted: boolean; onAccept: (v: boolean) => void }) {
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
  const label = c.emotion[0]!.toUpperCase() + c.emotion.slice(1);
  return (
    <li className={`st-take ${accepted ? 'st-take--chosen' : ''}`}>
      <IconButton size="sm" label={playing ? `Stop ${label}` : `Play ${label}`} icon={playing ? <Pause size={13} /> : <Play size={13} />} onClick={toggle} />
      <span>{label}</span>
      <span className="fr-faint">{c.durationS.toFixed(1)} s</span>
      {c.similarity !== null && <StatusBadge tone={c.similarity >= 0.75 ? 'success' : 'warning'} title={tt('Speaker similarity to the neutral reference')}>{Math.round(c.similarity * 100)}  {tt('% match')}</StatusBadge>}
      {c.fixture && <StatusBadge tone="neutral" title={tt('Fixture audio — not real speech')}>{tt('Fixture')}</StatusBadge>}
      <span className="fr-spacer" />
      <Switch checked={accepted} onChange={onAccept} label={`Accept ${label}`} />
    </li>
  );
}
