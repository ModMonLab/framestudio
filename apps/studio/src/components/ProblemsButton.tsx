/** Problems (FR-PER-06): live validation results; each problem jumps to its object or clip. */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { Problem } from '@frame/schema';
import { Button, EmptyState, Popover, StatusBadge, useAnchor } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

export function ProblemsButton() {
  const { studio } = useCtx();
  const pid = useStudio(studio, (s) => s.pid);
  const revision = useStudio(studio, (s) => s.revision);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();

  // Re-validate after edits (debounced; validation runs on the server with the library and media checks).
  useEffect(() => {
    const t = setTimeout(() => {
      api.validate(pid).then((r) => setProblems(r.problems.filter((p) => p.severity !== 'info'))).catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [pid, revision]);

  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  const go = (p: Problem) => {
    const s = studio.state;
    const scene = p.scene ?? s.scene;
    const sc = scene ? s.project?.scenes[scene] : undefined;
    const patch: Parameters<typeof studio.set>[0] = { ...(scene ? { scene } : {}) };
    if (p.target && sc) {
      if (p.target.kind === 'clip') {
        const c = sc.clips.find((x) => x.id === p.target!.id);
        Object.assign(patch, { selection: [{ kind: 'clip', id: p.target.id }], ...(c ? { time: c.start } : {}) });
      } else if (p.target.kind === 'instance') Object.assign(patch, { selection: [{ kind: 'instance', id: p.target.id }] });
    }
    studio.set({ ...patch, playing: false });
    setOpen(false);
  };
  const label = errors ? `${errors} problem${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'No problems';
  return (
    <>
      <button ref={anchor} type="button" className="st-badge-btn" aria-expanded={open} aria-label={`Problems: ${label}`} onClick={() => setOpen(!open)}>
        <StatusBadge tone={errors ? 'danger' : warnings ? 'warning' : 'success'}>{label}</StatusBadge>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Problems" placement="bottom-end" width={380}>
        {problems.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={24} />} title="No problems">The project is ready to export.</EmptyState>
        ) : (
          <ul className="st-problem-list">
            {problems.map((p, i) => (
              <li key={i} className="st-problem">
                {p.severity === 'error' ? <XCircle size={14} className="st-sev st-sev--error" aria-label="Error" /> : <AlertTriangle size={14} className="st-sev st-sev--warning" aria-label="Warning" />}
                <span className="st-problem__msg">{p.message}{p.blocksExport ? <span className="fr-faint"> · blocks export</span> : null}</span>
                {(p.target || p.scene) && <Button variant="ghost" onClick={() => go(p)}>Go to</Button>}
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  );
}
