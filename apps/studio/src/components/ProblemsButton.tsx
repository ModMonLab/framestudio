/**
 * Problems (FR-PER-06): live validation results grouped by severity; each problem jumps to its object or clip, and
 * fixable ones have a one-click fix (a command, a take generation, or relinking the original media file).
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { Problem } from '@frame/schema';
import type { Command } from '@frame/schema';
import { Button, EmptyState, Popover, StatusBadge, useAnchor, useToasts, t as tt } from '@frame/ui';
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
  const toasts = useToasts();
  const relinkInput = useRef<HTMLInputElement>(null);
  const [relink, setRelink] = useState<string>();

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
  const fix = async (p: Problem) => {
    const c = p.fix?.command as (Command | { job: 'generate'; scene: string; line: string } | { job: 'relink'; hash: string }) | undefined;
    if (!c) return;
    try {
      if ('job' in c && c.job === 'generate') {
        await api.generateTakes(pid, { scene: c.scene, lines: [c.line], takes: 1 });
        toasts.show({ tone: 'success', message: 'Generating a take.' });
      } else if ('job' in c && c.job === 'relink') {
        setRelink(c.hash);
        relinkInput.current?.click();
      } else if ('name' in c) await studio.exec([c], p.fix!.label);
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const onRelink = async (file: File | undefined) => {
    if (!file || !relink) return;
    try {
      await api.relinkMedia(pid, relink, file);
      toasts.show({ tone: 'success', message: `Relinked ${file.name}.` });
      const r = await api.validate(pid);
      setProblems(r.problems.filter((p) => p.severity !== 'info'));
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const row = (p: Problem, i: number) => (
    <li key={i} className="st-problem">
      {p.severity === 'error' ? <XCircle size={14} className="st-sev st-sev--error" aria-label={tt('Error')} /> : <AlertTriangle size={14} className="st-sev st-sev--warning" aria-label={tt('Warning')} />}
      <span className="st-problem__msg">{p.message}{p.blocksExport ? <span className="fr-faint">  {tt('· blocks export')}</span> : null}</span>
      {(p.target || p.scene) && <Button variant="ghost" onClick={() => go(p)}>{tt('Go to')}</Button>}
      {p.fix?.command !== undefined && <Button variant="ghost" onClick={() => void fix(p)}>{p.fix.label}</Button>}
    </li>
  );
  const label = errors ? `${errors} problem${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'No problems';
  return (
    <>
      <button ref={anchor} type="button" className="st-badge-btn" aria-expanded={open} aria-label={`Problems: ${label}`} onClick={() => setOpen(!open)}>
        <StatusBadge tone={errors ? 'danger' : warnings ? 'warning' : 'success'}>{label}</StatusBadge>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={tt('Problems')} placement="bottom-end" width={380}>
        {problems.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={24} />} title={tt('No problems')}>{tt('The project is ready to export.')}</EmptyState>
        ) : (
          <div className="st-problem-groups">
            {errors > 0 && <><h3 className="st-problem-h">{tt('Errors (')}{errors})</h3><ul className="st-problem-list" aria-label={tt('Errors')}>{problems.filter((p) => p.severity === 'error').map(row)}</ul></>}
            {warnings > 0 && <><h3 className="st-problem-h">{tt('Warnings (')}{warnings})</h3><ul className="st-problem-list" aria-label={tt('Warnings')}>{problems.filter((p) => p.severity !== 'error').map(row)}</ul></>}
          </div>
        )}
      </Popover>
      <input ref={relinkInput} type="file" hidden aria-label={tt('Choose the missing media file')} onChange={(e) => { void onRelink(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}
