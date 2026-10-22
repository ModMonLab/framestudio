/** Home and project browser (Design System §7.3): open a project folder; recent projects. */
import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { AppBar, Button, EmptyState, Panel, TextField, useTheme, IconButton } from '@frame/ui';
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
            <p className="fr-hint">Create a project with <code className="fr-mono">frame init MyShow.frame</code>, then open its folder here.</p>
            {error && (
              <div role="alert" className="fr-error-text">
                {error.message}{error.hint ? ` ${error.hint}` : ''}
                {error.message.includes('older format') && <> <Button variant="ghost" onClick={() => void openPath(path, true)}>Upgrade and open</Button></>}
              </div>
            )}
          </div>
        </Panel>
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
