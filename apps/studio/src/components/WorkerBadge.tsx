/** Voice worker status (FR-VOI-12): connected, busy, offline, misconfigured, with the fix. */
import { useEffect, useState } from 'react';
import { Popover, StatusBadge, useAnchor, t as tt } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

const TONE = { connected: 'success', busy: 'info', offline: 'warning', misconfigured: 'danger' } as const;
const LABEL = { connected: 'Voice worker', busy: 'Voice worker busy', offline: 'Voice worker offline', misconfigured: 'Voice worker not set up' } as const;

export function WorkerBadge() {
  const { studio } = useCtx();
  const pid = useStudio(studio, (s) => s.pid);
  const jobs = useStudio(studio, (s) => s.jobs);
  const [st, setSt] = useState<WorkerStatus>();
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const busy = Object.values(jobs).filter((j) => (j.kind.startsWith('voice') || j.kind.startsWith('takes')) && (j.state === 'running' || j.state === 'queued')).length;
  useEffect(() => {
    let live = true;
    const poll = () => api.worker(pid).then((s) => live && setSt(s)).catch(() => live && setSt({ state: 'offline', message: 'The Frame Server did not answer' }));
    void poll();
    const t = setInterval(poll, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pid]);
  const state = st ? (busy && st.state === 'connected' ? 'busy' : st.state) : undefined;
  return (
    <>
      <button ref={anchor} type="button" className="st-badge-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={tt('Voice worker status')}>
        <StatusBadge tone={state ? TONE[state] : 'neutral'}>{state ? `${LABEL[state]}${state === 'busy' ? ` · ${busy}` : ''}` : 'Voice worker…'}</StatusBadge>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={tt('Voice worker')} placement="bottom-end" width={320}>
        <div className="st-form">
          <b>{state ? LABEL[state] : 'Checking…'}</b>
          {st?.url && <span className="fr-mono fr-faint">{st.url}</span>}
          {st?.fixture && <p className="fr-hint">{tt('Fixture engine: audio is a test signal, not real speech.')}</p>}
          {st?.capabilities && <p className="fr-faint">{st.capabilities.engines.map((e) => e.label).join(', ')}</p>}
          {st?.message && <p>{st.message}</p>}
          {st?.hint && <p className="fr-hint">{st.hint}</p>}
        </div>
      </Popover>
    </>
  );
}
