/**
 * Project versions (FR-PER-03): save a named snapshot, compare one with the current project (changed scenes, clips,
 * character versions and assets), and restore it as one undoable step.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, EmptyState, StatusBadge, TextField, useToasts, t as tt } from '@frame/ui';
import { api, type VersionComparison } from '../lib/api.js';

interface VersionInfo { id: string; name: string; createdAt: string; revision: number }

export function VersionsDialog({ pid, open, onClose }: { pid: string; open: boolean; onClose: () => void }) {
  const toasts = useToasts();
  const [versions, setVersions] = useState<VersionInfo[]>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [cmp, setCmp] = useState<VersionComparison>();

  const load = () => api.versions(pid).then((r) => setVersions([...r.versions].reverse())).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
  useEffect(() => {
    if (!open) return;
    setCmp(undefined);
    setSelected(undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pid]);
  useEffect(() => {
    if (!selected) return;
    setCmp(undefined);
    api.compareVersion(pid, selected).then(setCmp).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
  }, [selected, pid, toasts]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const v = await api.saveVersion(pid, name.trim());
      toasts.show({ tone: 'success', message: `Saved version “${v.name}”` });
      setName('');
      await load();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const restore = async (v: VersionInfo) => {
    setBusy(true);
    try {
      const r = await api.restoreVersion(pid, v.id);
      toasts.show({ tone: 'success', message: `${r.label}. Undo restores the previous state.` });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const openCopy = async (v: VersionInfo) => {
    const root = (await api.projects()).projects.find((p) => p.id === pid)?.root ?? '';
    const suggestion = root.replace(/(\.frame)?$/, '') + ` — ${v.name.replace(/[^\w -]+/g, '')}.frame`;
    const target = window.prompt('Folder for the copy', suggestion);
    if (!target?.trim()) return;
    setBusy(true);
    try {
      const c = await api.copyVersion(pid, v.id, target.trim());
      toasts.show({ tone: 'success', message: `Opened “${c.name}” as a separate project` });
      location.hash = `#/p/${encodeURIComponent(c.id)}`;
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const current = versions?.find((v) => v.id === selected);

  return (
    <Dialog title={tt('Versions')} open={open} onClose={onClose} wide footer={<Button onClick={onClose}>{tt('Close')}</Button>}>
      <div className="st-row">
        <TextField label={tt('Version name')} placeholder={tt('Version name, e.g. Before recasting')} value={name} onChange={setName} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!name.trim()} disabledReason={tt('Name the version first')}>{tt('Save version')}</Button>
      </div>
      {!versions ? <p className="fr-faint">{tt('Loading…')}</p> : !versions.length ? <EmptyState title={tt('No versions yet')}>{tt('Save a version to keep a snapshot you can compare with and restore later.')}</EmptyState> : (
        <div className="st-versions">
          <ul className="st-list" aria-label={tt('Saved versions')}>
            {versions.map((v) => (
              <li key={v.id}>
                <button type="button" className="st-list__row" aria-pressed={v.id === selected} onClick={() => setSelected(v.id)}>
                  <b>{v.name}</b>
                  <span className="fr-faint">{new Date(v.createdAt).toLocaleString()}  {tt('· revision')} {v.revision}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="st-version-detail" aria-live="polite">
            {!current ? <p className="fr-faint">{tt('Choose a version to compare it with the current project.')}</p> : !cmp ? <p className="fr-faint">{tt('Comparing…')}</p> : (
              <>
                <h3 className="st-h3">{tt('Changes since “')}{current.name}”</h3>
                {cmp.identical ? <p>{tt('The project is the same as this version.')}</p> : (
                  <ul className="st-problems" aria-label={tt('Differences')}>
                    {cmp.project.length > 0 && <li>{tt('Project settings:')} {cmp.project.join(', ')}</li>}
                    {cmp.scenes.map((s) => (
                      <li key={s.id}>
                        <StatusBadge tone={s.change === 'added' ? 'success' : s.change === 'removed' ? 'danger' : 'info'}>{s.change === 'added' ? 'Added' : s.change === 'removed' ? 'Removed' : 'Changed'}</StatusBadge> {s.name}
                        {s.clips && ` — clips +${s.clips.added} −${s.clips.removed} ~${s.clips.changed}, objects +${s.instances!.added} −${s.instances!.removed} ~${s.instances!.changed}`}
                        {(s.versions ?? []).map((v) => <div key={v.instance} className="fr-faint">{v.instance}{tt(': version')} {v.from.split('@')[1]} → {v.to.split('@')[1]}</div>)}
                      </li>
                    ))}
                    {cmp.assets.added.length > 0 && <li>{cmp.assets.added.length}  {tt('asset version(s) added')}</li>}
                    {cmp.assets.removed.length > 0 && <li>{cmp.assets.removed.length}  {tt('asset version(s) removed')}</li>}
                    {(cmp.takes.added > 0 || cmp.takes.removed > 0) && <li>{tt('Takes +')}{cmp.takes.added} −{cmp.takes.removed}</li>}
                  </ul>
                )}
                <div className="st-buttons">
                  <Button onClick={() => void restore(current)} disabled={busy || cmp.identical} disabledReason={busy ? 'Working…' : 'Nothing to restore'}>{tt('Restore this version')}</Button>
                  <Button onClick={() => void openCopy(current)} disabled={busy} disabledReason={tt('Working…')}>{tt('Open as a copy…')}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
