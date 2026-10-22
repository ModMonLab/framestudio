/** Home and project browser (Design System §7.3): open a project folder; recent projects. */
import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { AppBar, Button, EmptyState, Panel, Select, TextField, useTheme, IconButton } from '@frame/ui';
import { Moon, Sun } from 'lucide-react';
import { api, ApiError } from '../lib/api.js';

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
  const [error, setError] = useState<{ message: string; hint?: string }>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; name: string; root: string }[]>([]);
  const [server, setServer] = useState<'checking' | 'ok' | 'down'>('checking');
  const { resolved, setTheme } = useTheme();
  const recent = readRecent();

  useEffect(() => {
    api.projects().then((r) => {
      setOpen(r.projects);
      setServer('ok');
    }).catch(() => setServer('down'));
  }, []);

  const openPath = async (p: string, migrate = false) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.open(p.trim(), migrate);
      const snap = await api.state(r.id);
      rememberProject(r.root, snap.state.project.name);
      location.hash = `#/p/${encodeURIComponent(r.id)}`;
    } catch (e) {
      const err = e as ApiError;
      setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-root st-app">
      <AppBar right={<IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />} />
      <main className="st-home">
        <Panel title="Open a project" label="Open a project" style={{ width: 560 }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {server === 'down' && <p className="fr-error-text" role="alert">The Frame Server is not reachable. Start it with <code className="fr-mono">frame server start</code>.</p>}
            <form onSubmit={(e) => { e.preventDefault(); if (path.trim()) void openPath(path); }} style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <TextField label="Project folder" placeholder="/path/to/MyShow.frame" value={path} onChange={setPath} icon={<FolderOpen size={14} />} />
              </div>
              <Button variant="primary" type="submit" loading={busy} disabled={!path.trim() || server !== 'ok'} disabledReason={server !== 'ok' ? 'The server is not reachable' : 'Enter a project folder'}>Open</Button>
            </form>
            <p className="fr-hint">Or create one below (also <code className="fr-mono">frame init MyShow.frame</code>).</p>
            {error && (
              <div role="alert" className="fr-error-text">
                {error.message}{error.hint ? ` ${error.hint}` : ''}
                {error.message.includes('older format') && <> <Button variant="ghost" onClick={() => void openPath(path, true)}>Upgrade and open</Button></>}
              </div>
            )}
          </div>
        </Panel>
        <NewProject disabled={server !== 'ok'} onCreated={(r) => { rememberProject(r.root, r.name); location.hash = `#/p/${encodeURIComponent(r.id)}`; }} />
        <Panel title="Projects" label="Projects" style={{ width: 560 }}>
          {open.length === 0 && recent.length === 0 ? (
            <EmptyState title="No projects yet">Projects you open appear here.</EmptyState>
          ) : (
            <ul className="st-list">
              {open.map((p) => (
                <li key={p.id}><button type="button" className="st-list__row" onClick={() => (location.hash = `#/p/${encodeURIComponent(p.id)}`)}><b>{p.name}</b><span className="fr-faint">Open now · {p.root}</span></button></li>
              ))}
              {recent.filter((r) => !open.some((p) => p.root === r.path)).map((r) => (
                <li key={r.path}><button type="button" className="st-list__row" onClick={() => void openPath(r.path)}><b>{r.name}</b><span className="fr-faint">{r.path}</span></button></li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    </div>
  );
}

/** New project (FR-PRJ-01): empty, or from a production template; name, style family, frame rate, folder. */
function NewProject({ disabled, onCreated }: { disabled: boolean; onCreated: (r: { id: string; root: string; name: string }) => void }) {
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [family, setFamily] = useState<'flat' | 'illustrated'>('flat');
  const [fps, setFps] = useState('24');
  const [template, setTemplate] = useState('empty');
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
    <Panel title="New project" label="New project" style={{ width: 560 }}>
      <form style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (folder.trim()) void create(); }}>
        <TextField label="Folder" placeholder="/path/to/NewShow.frame" value={folder} onChange={setFolder} icon={<FolderOpen size={14} />} />
        <TextField label="Name" placeholder="Defaults to the folder name" value={name} onChange={setName} />
        <div className="st-grid2">
          <Select label="Style" value={family} onChange={(v) => setFamily(v as 'flat' | 'illustrated')} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
          <Select label="Frame rate" value={fps} onChange={setFps} options={[{ value: '24', label: '24 fps' }, { value: '25', label: '25 fps' }, { value: '30', label: '30 fps' }]} />
        </div>
        <Select label="Start from" value={template} onChange={setTemplate} options={[{ value: 'empty', label: 'Empty project' }, ...templates]} />
        <div><Button variant="primary" type="submit" loading={busy} disabled={disabled || !folder.trim()} disabledReason={disabled ? 'The server is not reachable' : 'Choose a folder for the project'}>Create project</Button></div>
        {error && <p role="alert" className="fr-error-text">{error}</p>}
      </form>
    </Panel>
  );
}
