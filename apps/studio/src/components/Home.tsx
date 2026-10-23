/** Home and project browser (Design System §7.3): open a project folder; recent projects. */
import { useEffect, useState } from 'react';
import { FolderOpen, HelpCircle, Moon, MoreHorizontal, Pin, PinOff, Settings, Sun } from 'lucide-react';
import type { Problem } from '@frame/schema';
import { AppBar, Button, Dialog, EmptyState, IconButton, MenuButton, Panel, SearchField, Select, TextField, useTheme, useToasts, t as tt } from '@frame/ui';
import { api, ApiError, type RecentProject } from '../lib/api.js';
import { FirstRun } from './Onboarding.js';

interface Recent {
  path: string;
  name: string;
  at: string;
}

const KEY = 'frame.recent';
function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Recent[];
  } catch {
    return [];
  }
}
export function rememberProject(path: string, name: string) {
  try {
    const list = [{ path, name, at: new Date().toISOString() }, ...readRecent().filter((r) => r.path !== path)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: recent list is a convenience only */
  }
}

export function Home() {
  const [path, setPath] = useState('');
  const [error, setError] = useState<{ message: string; hint?: string; problems?: Problem[] }>();
  const [report, setReport] = useState<{ id: string; root: string; name: string; problems: Problem[] }>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; name: string; root: string }[]>([]);
  const [server, setServer] = useState<'checking' | 'ok' | 'down'>('checking');
  const [template, setTemplate] = useState('empty');
  const [templates, setTemplates] = useState<{ value: string; label: string }[]>([]);
  const { resolved, setTheme } = useTheme();

  useEffect(() => {
    api.projects().then((r) => {
      setOpen(r.projects);
      setServer('ok');
      api.library('', 'tpl', undefined, 100).then((t) => setTemplates(t.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setTemplates([]));
    }).catch(() => setServer('down'));
  }, []);

  const go = (id: string) => (location.hash = `#/p/${encodeURIComponent(id)}`);
  // Opening validates the folder (FR-PRJ-07): a folder that cannot load shows its report; one that loads with errors
  // shows them before entering the project.
  const openPath = async (p: string, migrate = false) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.open(p.trim(), migrate);
      const snap = await api.state(r.id);
      rememberProject(r.root, snap.state.project.name);
      const errors = r.problems.filter((x) => x.severity === 'error');
      if (errors.length) setReport({ id: r.id, root: r.root, name: snap.state.project.name, problems: errors });
      else go(r.id);
    } catch (e) {
      const err = e as ApiError;
      const problems = (err.details as { problems?: Problem[] } | undefined)?.problems;
      setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}), ...(problems?.length ? { problems } : {}) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-root st-app">
      <AppBar right={<>
        <IconButton label={tt('Help')} icon={<HelpCircle size={16} />} onClick={() => (location.hash = '#/help')} />
        <IconButton label={tt('Settings')} icon={<Settings size={16} />} onClick={() => (location.hash = '#/settings')} />
        <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />
      </>} />
      <main className="st-home">
        <h1 className="fr-sr">{tt('Frame projects')}</h1>
        <div className="st-home-col">
          <Panel title={tt('Open a project')} label={tt('Open a project')} help="#/help/projects">
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {server === 'down' && <p className="fr-error-text" role="alert">{tt('The Frame Server is not reachable. Start it with')} <code className="fr-mono">{tt('frame server start')}</code>.</p>}
              <form onSubmit={(e) => { e.preventDefault(); if (path.trim()) void openPath(path); }} style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <TextField label={tt('Project folder')} placeholder={tt('/path/to/MyShow.frame')} value={path} onChange={setPath} icon={<FolderOpen size={14} />} />
                </div>
                <Button variant="primary" type="submit" loading={busy} disabled={!path.trim() || server !== 'ok'} disabledReason={server !== 'ok' ? 'The server is not reachable' : 'Enter a project folder'}>{tt('Open')}</Button>
              </form>
              <p className="fr-hint">{tt('Or create one below (also')} <code className="fr-mono">{tt('frame init MyShow.frame')}</code>).</p>
              {error && (
                <div role="alert" className="fr-error-text">
                  {error.message}{error.hint ? ` ${error.hint}` : ''}
                  {error.message.includes('older format') && <> <Button variant="ghost" onClick={() => void openPath(path, true)}>{tt('Upgrade and open')}</Button></>}
                  {error.problems && <ProblemList problems={error.problems} />}
                </div>
              )}
            </div>
          </Panel>
          <NewProject disabled={server !== 'ok'} template={template} setTemplate={setTemplate} onCreated={(r) => { rememberProject(r.root, r.name); go(r.id); }} />
        </div>
        <ProjectBrowser server={server} open={open} onOpen={(root) => void openPath(root)} onUseTemplate={setTemplate} />
      </main>
      {server === 'ok' && <FirstRun templates={templates} onTemplate={setTemplate} />}
      {report && (
        <Dialog title={`${report.name} opened with problems`} open onClose={() => setReport(undefined)} footer={<>
          <Button onClick={() => setReport(undefined)}>{tt('Close')}</Button>
          <Button variant="primary" onClick={() => go(report.id)}>{tt('Open anyway')}</Button>
        </>}>
          <p>{tt('Some files in')} <span className="fr-mono">{report.root}</span>  {tt('could not be read. The rest of the project opens; the Problems list in the Studio keeps these.')}</p>
          <ProblemList problems={report.problems} />
        </Dialog>
      )}
    </div>
  );
}

function ProblemList({ problems }: { problems: Problem[] }) {
  return (
    <ul className="st-home-problems" aria-label={tt('Validation report')}>
      {problems.slice(0, 30).map((p, i) => <li key={i}><span className="fr-mono">{p.code}</span> {p.message}</li>)}
      {problems.length > 30 && <li className="fr-faint">{tt('…and')} {problems.length - 30}  {tt('more')}</li>}
    </ul>
  );
}

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

/** Project browser (FR-PRJ-06): recent and pinned projects with thumbnails; search, sort; open, reveal, duplicate, export package, delete to trash. */
function ProjectBrowser({ server, open, onOpen, onUseTemplate }: { server: string; open: { id: string; name: string; root: string }[]; onOpen: (root: string) => void; onUseTemplate: (ref: string) => void }) {
  const toasts = useToasts();
  const [list, setList] = useState<RecentProject[]>();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [dup, setDup] = useState<RecentProject>();
  const [del, setDel] = useState<RecentProject>();
  const [templates, setTemplates] = useState<{ ref: string; name: string; tags: string[] }[]>([]);
  const refresh = () => api.recent().then((r) => setList(r.projects)).catch(() => setList(undefined));
  useEffect(() => {
    if (server !== 'ok') return;
    void refresh();
    api.library('', 'tpl', undefined, 100).then((r) => setTemplates(r.results)).catch(() => setTemplates([]));
  }, [server]);
  // Without a server-side list (no user folder) the browser falls back to this browser's own history.
  const items: RecentProject[] = list ?? readRecent().map((r) => ({ root: r.path, name: r.name, openedAt: r.at, episodes: 0, scenes: 0, exists: true, open: open.find((p) => p.root === r.path)?.id ?? null }));
  const needle = q.trim().toLowerCase();
  const shown = items.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.root.toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.openedAt.localeCompare(a.openedAt)));
  const pinned = shown.filter((p) => p.pinned);
  const rest = shown.filter((p) => !p.pinned);
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) toasts.show({ tone: 'success', message: ok });
      await refresh();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const exportPackage = (p: RecentProject) => void act(async () => {
    const id = p.open ?? (await api.open(p.root)).id;
    location.href = api.projectPackageUrl(id);
  });
  const card = (p: RecentProject) => (
    <li key={p.root} className={`st-pcard ${p.exists ? '' : 'st-pcard--missing'}`}>
      <button type="button" className="st-pcard-open" disabled={!p.exists} aria-label={`Open ${p.name}`} onClick={() => onOpen(p.root)}>
        {p.exists && list ? <img src={api.recentThumbUrl(p.root, p.openedAt)} width={160} height={90} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} /> : <span className="st-pcard-blank" aria-hidden />}
      </button>
      <div className="st-pcard-meta">
        <b className="st-pcard-name">{p.name}</b>
        <span className="fr-faint">{p.exists ? `${ago(p.openedAt)}${p.episodes ? ` · ${p.episodes} episode${p.episodes === 1 ? '' : 's'} · ${p.scenes} scene${p.scenes === 1 ? '' : 's'}` : ''}${p.open ? ' · open' : ''}` : 'Folder missing'}</span>
        <span className="fr-faint fr-mono st-pcard-path" title={p.root}>{p.root}</span>
      </div>
      {list && (
        <div className="st-pcard-actions">
          <IconButton size="sm" label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`} pressed={!!p.pinned} icon={p.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => void act(() => api.recentUpdate(p.root, { pinned: !p.pinned }))} />
          <MenuButton label={`${p.name} actions`} placement="bottom-end" items={p.exists ? [
            { id: 'open', label: 'Open', onSelect: () => onOpen(p.root) },
            { id: 'reveal', label: 'Reveal in folder', onSelect: () => void act(() => api.recentReveal(p.root)) },
            { id: 'dup', label: 'Duplicate…', onSelect: () => setDup(p) },
            { id: 'pkg', label: 'Export package (.frameproj)', onSelect: () => exportPackage(p) },
            { kind: 'separator', id: 's' },
            { id: 'forget', label: 'Remove from list', onSelect: () => void act(() => api.recentUpdate(p.root, { forget: true })) },
            { id: 'del', label: 'Delete (move to trash)…', onSelect: () => setDel(p) },
          ] : [{ id: 'forget', label: 'Remove from list', onSelect: () => void act(() => api.recentUpdate(p.root, { forget: true })) }]}
          trigger={(t) => <IconButton ref={t.ref} size="sm" label={`${p.name} actions`} icon={<MoreHorizontal size={14} />} aria-haspopup={t['aria-haspopup']} aria-expanded={t['aria-expanded']} onClick={t.toggle} />} />
        </div>
      )}
    </li>
  );
  return (
    <div className="st-home-col st-home-col--wide">
      <Panel title={tt('Projects')} label={tt('Projects')} help="#/help/projects">
        <div className="st-home-tools">
          <div style={{ flex: 1 }}><SearchField label={tt('Search projects')} placeholder={tt('Search projects')} value={q} onChange={setQ} /></div>
          <div style={{ width: 150 }}><Select label={tt('Sort')} value={sort} onChange={(v) => setSort(v as 'recent' | 'name')} options={[{ value: 'recent', label: 'Last opened' }, { value: 'name', label: 'Name' }]} /></div>
        </div>
        {items.length === 0 ? <EmptyState title={tt('No projects yet')}>{tt('Projects you open or create appear here.')}</EmptyState>
          : shown.length === 0 ? <EmptyState title={tt('No matches')}>{tt('No project name or folder contains “')}{q}”.</EmptyState>
          : <>
            {pinned.length > 0 && <><h2 className="st-home-h">{tt('Pinned')}</h2><ul className="st-pcards" aria-label={tt('Pinned projects')}>{pinned.map(card)}</ul></>}
            {rest.length > 0 && <>{pinned.length > 0 && <h2 className="st-home-h">{tt('Recent')}</h2>}<ul className="st-pcards" aria-label={tt('Recent projects')}>{rest.map(card)}</ul></>}
          </>}
      </Panel>
      {templates.length > 0 && (
        <Panel title={tt('Templates')} label={tt('Templates')} help="#/help/start">
          <ul className="st-home-templates">
            {templates.map((t) => (
              <li key={t.ref}><span>{t.name}</span><Button variant="ghost" onClick={() => { onUseTemplate(t.ref); document.querySelector<HTMLInputElement>('[aria-label="Folder"]')?.focus(); }}>{tt('Use')}</Button></li>
            ))}
          </ul>
        </Panel>
      )}
      {dup && <DuplicateDialog p={dup} onClose={() => setDup(undefined)} onDone={(r) => { setDup(undefined); void refresh(); toasts.show({ tone: 'success', message: `Duplicated as ${r.name}.` }); }} />}
      {del && (
        <Dialog title={`Delete ${del.name}?`} open onClose={() => setDel(undefined)} footer={<>
          <Button onClick={() => setDel(undefined)}>{tt('Cancel')}</Button>
          <Button variant="danger" onClick={() => { const p = del; setDel(undefined); void act(() => api.recentTrash(p.root), `${p.name} moved to the trash.`); }}>{tt('Move to trash')}</Button>
        </>}>
          <p>{tt('The folder')} <span className="fr-mono">{del.root}</span>  {tt('moves to the trash. You can restore it from there.')}</p>
        </Dialog>
      )}
    </div>
  );
}

function DuplicateDialog({ p, onClose, onDone }: { p: RecentProject; onClose: () => void; onDone: (r: { id: string; root: string; name: string }) => void }) {
  const [to, setTo] = useState(p.root.replace(/(\.frame)?\/?$/, ' copy.frame'));
  const [name, setName] = useState(`${p.name} copy`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await api.recentDuplicate(p.root, to.trim(), name.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Duplicate ${p.name}`} open onClose={onClose} footer={<>
      <Button onClick={onClose}>{tt('Cancel')}</Button>
      <Button variant="primary" loading={busy} disabled={!to.trim()} disabledReason={tt('Choose a folder')} onClick={() => void run()}>{tt('Duplicate')}</Button>
    </>}>
      <div className="st-form st-form--flush">
        <TextField label={tt('New folder')} value={to} onChange={setTo} />
        <TextField label={tt('New name')} value={name} onChange={setName} />
        <p className="fr-hint">{tt('The copy gets its own project id, so both can be open at once.')}</p>
        {error && <p role="alert" className="fr-error-text">{error}</p>}
      </div>
    </Dialog>
  );
}

/** New project (FR-PRJ-01): empty, or from a production template; name, style family, frame rate, folder. */
function NewProject({ disabled, onCreated, template, setTemplate }: { disabled: boolean; onCreated: (r: { id: string; root: string; name: string }) => void; template: string; setTemplate: (v: string) => void }) {
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [family, setFamily] = useState<'flat' | 'illustrated'>('flat');
  const [fps, setFps] = useState('24');
  const [pkg, setPkg] = useState<File>();
  const [templates, setTemplates] = useState<{ value: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (disabled) return;
    api.library('', 'tpl', undefined, 100).then((r) => setTemplates(r.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setTemplates([]));
  }, [disabled]);
  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (template === 'package') {
        if (!pkg) throw new ApiError('USAGE', 'Choose a .frameproj package');
        const r = await api.importProjectPackage(folder.trim(), pkg);
        return onCreated(r);
      }
      const r = await api.create({ path: folder.trim(), ...(name.trim() ? { name: name.trim() } : {}), styleFamily: family, frameRate: Number(fps), ...(template !== 'empty' ? { template } : {}) });
      onCreated(r);
    } catch (e) {
      const err = e as ApiError;
      setError(`${err.message}${err.hint ? ` ${err.hint}` : ''}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={tt('New project')} label={tt('New project')} help="#/help/start">
      <form style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (folder.trim()) void create(); }}>
        <TextField label={tt('Folder')} placeholder={tt('/path/to/NewShow.frame')} value={folder} onChange={setFolder} icon={<FolderOpen size={14} />} />
        <TextField label={tt('Name')} placeholder={tt('Defaults to the folder name')} value={name} onChange={setName} />
        <div className="st-grid2">
          <Select label={tt('Style')} value={family} onChange={(v) => setFamily(v as 'flat' | 'illustrated')} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
          <Select label={tt('Frame rate')} value={fps} onChange={setFps} options={[{ value: '24', label: '24 fps' }, { value: '25', label: '25 fps' }, { value: '30', label: '30 fps' }]} />
        </div>
        <Select label={tt('Start from')} value={template} onChange={setTemplate} options={[{ value: 'empty', label: 'Empty project' }, { value: 'package', label: 'Project package (.frameproj)…' }, ...templates]} />
        {template === 'package' && (
          <label className="st-file">
            <span>{tt('Package')}</span>
            <input type="file" accept=".frameproj" aria-label={tt('Project package')} onChange={(e) => setPkg(e.target.files?.[0])} />
          </label>
        )}
        <div><Button variant="primary" type="submit" loading={busy} disabled={disabled || !folder.trim()} disabledReason={disabled ? 'The server is not reachable' : 'Choose a folder for the project'}>{tt('Create project')}</Button></div>
        {error && <p role="alert" className="fr-error-text">{error}</p>}
      </form>
    </Panel>
  );
}
