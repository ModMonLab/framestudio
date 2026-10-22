/** Jobs popover (FR-ARC-05, FR-RND-07): progress, cancel, retry hint, and completed exports in an in-app player. */
import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button, Dialog, EmptyState, IconButton, JobRow, Popover, useAnchor } from '@frame/ui';
import { api, type JobInfo } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

const secs = (a?: string, b?: string) => (a ? Math.max(0, ((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000) : undefined);

export function JobsButton() {
  const { studio } = useCtx();
  const jobs = useStudio(studio, (s) => s.jobs);
  const pid = useStudio(studio, (s) => s.pid);
  const anchor = useAnchor();
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState<JobInfo>();
  const [playError, setPlayError] = useState(false);
  const list = Object.values(jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const active = list.filter((j) => j.state === 'queued' || j.state === 'running').length;
  const fileUrl = (p: string) => `/api/projects/${encodeURIComponent(pid)}/files?path=${encodeURIComponent(p)}`;
  return (
    <>
      <IconButton ref={anchor} label={active ? `Jobs: ${active} running` : 'Jobs'} icon={<span className="st-jobs-icon"><ListChecks size={16} />{active > 0 && <span className="st-count">{active}</span>}</span>} onClick={() => setOpen(!open)} pressed={open} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Jobs" placement="bottom-end" width={360}>
        {list.length === 0 ? <EmptyState title="No jobs">Exports and voice work appear here.</EmptyState> : list.map((j) => {
          const running = j.state === 'queued' || j.state === 'running';
          const remaining = running && j.progress > 0.02 && j.startedAt ? (secs(j.startedAt)! * (1 - j.progress)) / j.progress : undefined;
          return (
            <JobRow
              key={j.id}
              name={j.title}
              state={j.state === 'succeeded' ? (j.result?.fixtureAudio ? 'Completed · contains fixture audio (not real speech)' : 'Completed') : j.state === 'failed' ? `Failed: ${j.error?.message ?? ''}` : j.state === 'cancelled' ? 'Cancelled' : j.message}
              progress={j.state === 'queued' ? undefined : j.progress}
              failed={j.state === 'failed'}
              elapsedS={secs(j.startedAt, j.finishedAt)}
              remainingS={remaining}
              {...(running ? { onCancel: () => void api.cancelJob(j.id) } : {})}
              action={j.state === 'succeeded' && j.kind === 'render' && j.result?.output ? <Button variant="ghost" onClick={() => { setPlayError(false); setPlayer(j); }}>Play</Button> : undefined}
            />
          );
        })}
      </Popover>
      <Dialog title={player ? `Export · ${player.title.replace(/^Export · /, '')}` : 'Export'} open={!!player} onClose={() => setPlayer(undefined)} wide>
        {player?.result?.output && (
          <>
            {playError ? (
              <p role="alert" className="fr-hint">This browser cannot play {String(player.result.settings?.video ?? 'this').toUpperCase()} video. Open the file in a video player, or export with the Web WebM preset to play it here.</p>
            ) : (
              <video src={fileUrl(player.result.output)} controls style={{ width: '100%', background: '#000' }} onError={() => setPlayError(true)} />
            )}
            <p className="fr-faint fr-mono" style={{ wordBreak: 'break-all' }}>{player.result.output}</p>
            {player.result.fixtureAudio && <p className="fr-hint">This export contains fixture audio from the test worker — not real speech.</p>}
          </>
        )}
      </Dialog>
    </>
  );
}
