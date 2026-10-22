/**
 * Activity log (FR-AGT-05, Design System §7 "CLI/agent activity log"): recent changes with who made them (people,
 * the CLI, agent sessions); each agent session lists the commands it applied and reverts as one undoable step.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bot, History, Terminal, User } from 'lucide-react';
import { Button, EmptyState, Popover, StatusBadge, useAnchor, useToasts } from '@frame/ui';
import { api, type HistoryEntry } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Session { source: string; id: string; steps: HistoryEntry[]; reverted: boolean }

function who(source: string): string {
  if (source.startsWith('agent:')) return `Agent ${source.slice(6)}`;
  if (source === 'cli') return 'CLI';
  if (source === 'external') return 'Changed on disk';
  return 'Studio';
}

function time(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ActivityButton() {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const revision = useStudio(studio, (s) => s.revision);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const anchor = useAnchor();

  useEffect(() => {
    if (!open) return;
    api.history(pid).then((r) => setHistory(r.history)).catch(() => undefined);
  }, [open, pid, revision]);

  const sessions = useMemo<Session[]>(() => {
    const by = new Map<string, Session>();
    for (const h of history) {
      if (!h.source.startsWith('agent:')) continue;
      const s = by.get(h.source) ?? { source: h.source, id: h.source.slice(6), steps: [], reverted: false };
      s.steps.push(h);
      by.set(h.source, s);
    }
    // Reverted unless the latest revert of the session was undone (labels "Revert X" / "Undo Revert X" / "Redo Revert X").
    for (const s of by.values()) {
      const last = history.filter((h) => h.label.endsWith(`Revert ${s.source}`) && h.revision > s.steps.at(-1)!.revision).at(-1);
      s.reverted = !!last && !last.label.startsWith('Undo ');
    }
    return [...by.values()].reverse();
  }, [history]);
  const recent = history.slice(-40).reverse();
  const active = sessions.filter((s) => !s.reverted).length;

  const revert = async (s: Session) => {
    setBusy(s.source);
    try {
      await api.revertSource(pid, s.source);
      toasts.show({ tone: 'success', message: `Reverted ${s.steps.length} change${s.steps.length > 1 ? 's' : ''} by agent ${s.id}. Undo brings them back.` });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <button ref={anchor} type="button" className="st-badge-btn" aria-expanded={open} aria-label={`Activity${active ? `: ${active} agent session${active > 1 ? 's' : ''}` : ''}`} onClick={() => setOpen(!open)}>
        <StatusBadge tone={active ? 'info' : 'neutral'}><History size={12} aria-hidden /> Activity{active ? ` · ${active} agent` : ''}</StatusBadge>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Activity" placement="bottom-end" width={420}>
        {history.length === 0 ? (
          <EmptyState icon={<History size={24} />} title="No changes yet">Edits from the Studio, the CLI and agents appear here.</EmptyState>
        ) : (
          <div className="st-activity">
            {sessions.length > 0 && <h3>Agent sessions</h3>}
            {sessions.map((s) => (
              <div key={s.source} className="st-activity__session">
                <Bot size={16} aria-hidden />
                <div>
                  <div>Agent {s.id}</div>
                  <div className="fr-faint">{s.steps.length} change{s.steps.length > 1 ? 's' : ''} · {[...new Set(s.steps.flatMap((h) => h.commands.map((c) => c.name)))].slice(0, 4).join(', ')}{s.reverted ? ' · reverted' : ''}</div>
                </div>
                <Button disabled={s.reverted} disabledReason="Already reverted" loading={busy === s.source} onClick={() => void revert(s)}>Revert session</Button>
              </div>
            ))}
            <h3>Recent changes</h3>
            <ul className="st-activity" aria-label="Recent changes">
              {recent.map((h) => (
                <li key={h.revision} className="st-activity__row">
                  {h.source.startsWith('agent:') ? <Bot size={13} aria-label="Agent" /> : h.source === 'cli' ? <Terminal size={13} aria-label="CLI" /> : <User size={13} aria-label="Person" />}
                  <span>{h.label} <span className="fr-faint">· {who(h.source)}</span></span>
                  <span className="fr-faint">{time(h.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Popover>
    </>
  );
}
