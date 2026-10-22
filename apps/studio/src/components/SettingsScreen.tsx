/**
 * Settings (FR-SET-01): appearance (theme, density, language), projects (autosave, default frame rate and output),
 * voice worker (URL, token, status), library locations, keyboard shortcuts (rebindable), privacy, storage.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AppBar, Button, NumberField, Panel, Segmented, Select, StatusBadge, TextField, useTheme, useToasts, type ThemeChoice } from '@frame/ui';
import { api, type AppSettingsInfo, type WorkerStatus } from '../lib/api.js';
import { comboOf, SHORTCUT_ACTIONS, setPrefs, shortcutLabel, usePrefs, type Density, type ShortcutAction } from '../lib/prefs.js';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const prefs = usePrefs();
  const toasts = useToasts();
  const [info, setInfo] = useState<AppSettingsInfo>();
  const [worker, setWorker] = useState<WorkerStatus>();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [outputs, setOutputs] = useState<{ value: string; label: string }[]>([]);
  const [binding, setBinding] = useState<ShortcutAction>();
  const load = () => api.settings().then((r) => { setInfo(r); setUrl(r.settings.workerUrl ?? ''); }).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
  const check = () => api.worker().then(setWorker).catch(() => setWorker(undefined));
  useEffect(() => {
    void load();
    void check();
    api.library('', 'out', undefined, 50).then((r) => setOutputs(r.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setOutputs([]));
    // Loaded once on open; later refreshes go through load() after each save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async (patch: Record<string, unknown>, ok: string) => {
    try {
      await api.saveSettings(patch);
      await load();
      toasts.show({ tone: 'success', message: ok });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  // Capture the next key combination for a shortcut; Escape cancels, Backspace restores the default.
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setBinding(undefined);
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;
      const shortcuts = { ...prefs.shortcuts };
      if (e.key === 'Backspace') delete shortcuts[binding];
      else {
        const combo = comboOf(e);
        if (!combo.startsWith('Mod+')) return toasts.show({ tone: 'warning', message: 'Use Ctrl or ⌘ with another key, so typing never triggers it.' });
        const clash = (Object.keys(SHORTCUT_ACTIONS) as ShortcutAction[]).find((a) => a !== binding && (prefs.shortcuts[a] ?? SHORTCUT_ACTIONS[a].default) === combo);
        if (clash) return toasts.show({ tone: 'warning', message: `${combo.replace('Mod', 'Ctrl/⌘')} is already ${SHORTCUT_ACTIONS[clash].label}.` });
        shortcuts[binding] = combo;
      }
      setPrefs({ shortcuts });
      setBinding(undefined);
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [binding, prefs.shortcuts, toasts]);

  return (
    <div className="fr-root st-app">
      <AppBar left={<Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => (history.length > 1 ? history.back() : (location.hash = '#/'))}>Back</Button>} />
      <main className="st-settings-page">
        <h1 className="st-settings-title">Settings</h1>
        <Panel title="Appearance" label="Appearance" help="#/help/start">
          <div className="st-settings-body">
            <Segmented label="Theme" value={theme} onChange={(v) => setTheme(v as ThemeChoice)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
            <Segmented label="Density" value={prefs.density} onChange={(v) => setPrefs({ density: v as Density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
            <Select label="Language" value="en" onChange={() => undefined} options={[{ value: 'en', label: 'English' }]} />
          </div>
        </Panel>
        <Panel title="Projects" label="Projects settings" help="#/help/projects">
          <div className="st-settings-body">
            {info && <NumberField label="Autosave delay" prefix="Save after" unit=" ms" precision={0} step={100} min={100} max={60000} value={info.effective.autosaveMs} onChange={(v, phase) => phase === 'commit' && void save({ autosaveMs: v }, 'Autosave delay changed.')} />}
            <Select label="Default frame rate" value={String(info?.settings.defaultFrameRate ?? '')} placeholder="Library default" options={['24', '25', '30'].map((v) => ({ value: v, label: `${v} fps` }))} onChange={(v) => void save({ defaultFrameRate: Number(v) }, `New projects use ${v} fps.`)} />
            <Select label="Default output" value={info?.settings.defaultOutput} placeholder="Library default" options={outputs} onChange={(v) => void save({ defaultOutput: v }, 'Default output changed.')} />
          </div>
        </Panel>
        <Panel title="Voice worker" label="Voice worker" help="#/help/voice">
          <div className="st-settings-body">
            <div className="st-settings-row">
              <StatusBadge tone={worker?.state === 'connected' ? 'success' : worker?.state === 'busy' ? 'info' : 'warning'}>{worker ? ({ connected: 'Connected', busy: 'Busy', offline: 'Offline', misconfigured: 'Not set up' } as const)[worker.state] : 'Checking…'}</StatusBadge>
              <span className="fr-faint">{worker?.label ?? worker?.message ?? ''}</span>
              <span className="fr-spacer" />
              <Button variant="ghost" onClick={() => void check()}>Check again</Button>
            </div>
            <TextField label="Worker URL" placeholder={info?.effective.workerUrl ?? 'http://127.0.0.1:8765'} value={url} onChange={setUrl} onBlur={() => url !== (info?.settings.workerUrl ?? '') && void save({ workerUrl: url }, 'Worker URL saved.').then(check)} />
            <div className="st-settings-row">
              <div style={{ flex: 1 }}><TextField label="Worker token" type="password" placeholder={info?.settings.workerTokenSet ? 'A token is set' : 'No token'} value={token} onChange={setToken} /></div>
              <Button disabled={!token} disabledReason="Type a token" onClick={() => void save({ workerToken: token }, 'Token saved.').then(() => { setToken(''); void check(); })}>Save token</Button>
              {info?.settings.workerTokenSet && <Button variant="ghost" onClick={() => void save({ clearToken: true }, 'Token removed.')}>Remove</Button>}
            </div>
            <p className="fr-hint">The token is kept in your Frame settings on this machine, never in projects. Model and GPU options are set where the worker runs (<code className="fr-mono">frame-voice-worker serve --device …</code>); the engines it reports are listed here.</p>
            {worker?.capabilities && <ul className="st-settings-list">{worker.capabilities.engines.map((e) => <li key={e.id}>{e.label} <span className="fr-faint">· emotions: {e.controls.emotion.join(', ') || 'none'}</span></li>)}</ul>}
          </div>
        </Panel>
        <Panel title="Keyboard shortcuts" label="Keyboard shortcuts" help="#/help/shortcuts">
          <ul className="st-settings-list st-settings-keys">
            {(Object.keys(SHORTCUT_ACTIONS) as ShortcutAction[]).map((a) => (
              <li key={a}>
                <span>{SHORTCUT_ACTIONS[a].label}</span>
                <kbd className="fr-mono">{shortcutLabel(a)}</kbd>
                <Button variant="ghost" aria-label={`Change shortcut for ${SHORTCUT_ACTIONS[a].label}`} onClick={() => setBinding(a)}>{binding === a ? 'Press keys…' : 'Change'}</Button>
              </li>
            ))}
          </ul>
          <p className="fr-hint" style={{ padding: '0 16px 16px' }}>While changing, Backspace restores the default and Escape cancels. Space, J/K/L, arrows and 1/2/3 stay fixed.</p>
        </Panel>
        <Panel title="Library and storage" label="Library and storage" help="#/help/assets">
          <div className="st-settings-body">
            {info && <dl className="st-settings-dl">
              <dt>Bundled library</dt><dd className="fr-mono">{info.paths.content}</dd>
              <dt>Your library</dt><dd className="fr-mono">{info.paths.userLibrary ?? 'Not configured'} · {mb(info.storage.userLibraryBytes)}</dd>
              <dt>Thumbnail cache</dt><dd className="fr-mono">{info.paths.cache ?? 'In memory'} · {mb(info.storage.cacheBytes)}</dd>
            </dl>}
            <div><Button onClick={() => void api.clearCache().then(load).then(() => toasts.show({ tone: 'success', message: 'Thumbnail cache cleared; thumbnails rebuild as you browse.' }))}>Clear thumbnail cache</Button></div>
          </div>
        </Panel>
        <Panel title="Privacy" label="Privacy">
          <div className="st-settings-body">
            <p>Frame collects no telemetry. Projects, voices and recordings stay on your machines; the only network traffic is to the voice worker you configure.</p>
          </div>
        </Panel>
      </main>
    </div>
  );
}
