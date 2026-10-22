/** Studio workspace (Design System §4, §7.1): app bar, rail, left panel, canvas, properties and timeline. */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Image as ImageIcon, LayoutGrid, Layers, Moon, Music, Redo2, Sparkles, Sun, Trash2, Type, Undo2, Users } from 'lucide-react';
import { AppBar, Breadcrumb, Button, IconButton, MenuBar, Rail, StatusBadge, Tabs, Toolbar, ToolbarSeparator, useTheme, useToasts, VSep, type MenuEntry } from '@frame/ui';
import { Studio, useStudio, type Mode } from '../lib/store.js';
import { AssetCache } from '../lib/preview.js';
import { LayersPanel } from './LayersPanel.js';
import { AssetsPanel } from './AssetsPanel.js';
import { CanvasView } from './CanvasView.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { Timeline } from './Timeline.js';
import { EpisodeView } from './EpisodeView.js';
import { ExportDialog } from './ExportDialog.js';
import { JobsButton } from './JobsButton.js';
import { WorkerBadge } from './WorkerBadge.js';
import { ProblemsButton } from './ProblemsButton.js';
import { ActivityButton } from './ActivityButton.js';
import { VoiceDesigner } from './VoiceDesigner.js';
import { Builder } from './Builder.js';
import { PartEditor } from './PartEditor.js';
import { LibraryScreen } from './LibraryScreen.js';
import { VersionsDialog } from './VersionsDialog.js';
import { RecipeDialog } from './RecipeDialog.js';
import { TemplateDialog, saveSceneAsTemplate } from './TemplateDialog.js';
import { api } from '../lib/api.js';
import { usePlayback } from '../lib/playback.js';
import { ResizeHandle, usePanelSize } from './Resize.js';
import { ContextMenuHost } from './ContextMenu.js';

interface Ctx {
  studio: Studio;
  assets: AssetCache;
  openExport: () => void;
  openVoiceDesigner: (instance?: string) => void;
  openVersions: () => void;
  importPackage: () => void;
}
const StudioCtx = createContext<Ctx | null>(null);
export function useCtx(): Ctx {
  const c = useContext(StudioCtx);
  if (!c) throw new Error('StudioCtx missing');
  return c;
}

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Not saved' } as const;
const SAVE_TONE = { saved: 'success', saving: 'info', unsaved: 'warning', error: 'danger' } as const;

export function Workspace({ pid, builder, part, screen }: { pid: string; builder?: { scene: string; instance: string }; part?: string; screen?: 'library' }) {
  const studio = useMemo(() => new Studio(pid), [pid]);
  const assets = useMemo(() => new AssetCache(pid), [pid]);
  const [failed, setFailed] = useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const [voiceFor, setVoiceFor] = useState<string | undefined | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const pkgInput = useRef<HTMLInputElement>(null);
  const toasts = useToasts();
  // Imports a .framechar, .frameasset or .framevoice into the project (FR-IMP-04); conflicts can be kept under new IDs.
  const onPackage = async (file: File | undefined) => {
    if (!file) return;
    try {
      let r;
      try {
        r = await api.importPackage(pid, file);
      } catch (e) {
        if ((e as { code?: string }).code !== 'CONFLICT' || !window.confirm(`${(e as Error).message}\n\nImport them under new IDs instead?`)) throw e;
        r = await api.importPackage(pid, file, { newIds: true });
      }
      toasts.show({ tone: 'success', message: r.added.length ? `Imported ${r.added.length} asset(s)${r.renamed.length ? ` (${r.renamed.length} under new IDs)` : ''}` : 'Everything in the package is already in this project' });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };

  useEffect(() => {
    studio.start().catch((e: Error) => setFailed(e.message));
    return () => studio.dispose();
  }, [studio]);

  const project = useStudio(studio, (s) => s.project);
  const lastError = useStudio(studio, (s) => s.lastError);
  useEffect(() => {
    if (!lastError) return;
    toasts.show({ tone: 'error', message: lastError.hint ? `${lastError.message} ${lastError.hint}` : lastError.message });
    studio.set({ lastError: undefined });
  }, [lastError, studio, toasts]);

  if (failed) {
    return (
      <div className="fr-root st-app st-center">
        <p role="alert">This project could not be opened: {failed}</p>
        <Button onClick={() => (location.hash = '#/')}>Back to projects</Button>
      </div>
    );
  }
  if (!project) return <div className="fr-root st-app st-center" aria-busy="true">Opening project…</div>;
  const ctx: Ctx = { studio, assets, openExport: () => setExportOpen(true), openVoiceDesigner: (i) => setVoiceFor(i), openVersions: () => setVersionsOpen(true), importPackage: () => pkgInput.current?.click() };
  return (
    <StudioCtx.Provider value={ctx}>
      <ContextMenuHost>{screen === 'library' ? <LibraryScreen /> : part ? <PartEditor key={part} partRef={part} /> : builder ? <Builder scene={builder.scene} instance={builder.instance} /> : <Shell />}</ContextMenuHost>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <VoiceDesigner open={voiceFor !== null} instance={voiceFor ?? undefined} onClose={() => setVoiceFor(null)} />
      <VersionsDialog pid={pid} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <RecipeDialog />
      <TemplateDialog />
      <input ref={pkgInput} type="file" accept=".framechar,.frameasset,.framevoice" hidden aria-label="Import package" onChange={(e) => { void onPackage(e.target.files?.[0]); e.target.value = ''; }} />
    </StudioCtx.Provider>
  );
}

function Shell() {
  const { studio } = useCtx();
  const [rail, setRail] = useState('layers');
  const [panels, setPanels] = useState({ left: true, right: true, timeline: true });
  const mode = useStudio(studio, (s) => s.mode);
  const [leftW, setLeftW] = usePanelSize('left', 272, 220, 420);
  const [rightW, setRightW] = usePanelSize('right', 300, 260, 440);
  const [tlH, setTlH] = usePanelSize('timeline', 332, 160, 600);
  usePlayback();
  useShortcuts(setPanels);

  return (
    <div className="fr-root st-app st-shell" style={{ '--st-left': `${leftW}px`, '--st-right': `${rightW}px`, '--st-timeline': `${tlH}px` } as React.CSSProperties}>
      <TopBar onTogglePanel={(k) => setPanels((p) => ({ ...p, [k]: !p[k] }))} panels={panels} />
      <div className="st-main">
        <Rail value={rail} onChange={(v) => { setRail(v); setPanels((p) => ({ ...p, left: true })); }} items={[
          { id: 'layers', label: 'Layers', icon: <Layers size={18} /> },
          { id: 'assets', label: 'Assets', icon: <LayoutGrid size={18} /> },
          { id: 'cast', label: 'Cast', icon: <Users size={18} /> },
          { id: 'text', label: 'Text', icon: <Type size={18} /> },
          { id: 'effects', label: 'Effects', icon: <Sparkles size={18} /> },
          { id: 'audio', label: 'Audio', icon: <Music size={18} /> },
          { id: 'templates', label: 'Templates', icon: <ImageIcon size={18} /> },
        ]} />
        {panels.left && (rail === 'layers' ? <LayersPanel /> : <AssetsPanel filter={rail} />)}
        {panels.left && <ResizeHandle label="Resize left panel" value={leftW} min={220} max={420} defaultValue={272} onChange={setLeftW} dir={1} />}
        <div className="st-center-col">
          <ContextToolbar />
          <CanvasView />
        </div>
        {panels.right && <ResizeHandle label="Resize properties panel" value={rightW} min={260} max={440} defaultValue={300} onChange={setRightW} dir={-1} />}
        {panels.right && <PropertiesPanel mode={mode} />}
      </div>
      {panels.timeline && <ResizeHandle label="Resize timeline" value={tlH} min={160} max={600} defaultValue={332} onChange={setTlH} dir={-1} orientation="horizontal" />}
      {panels.timeline && <TimelineArea />}
      <span className="fr-sr" aria-live="polite">{mode} mode</span>
    </div>
  );
}

function TimelineArea() {
  const { studio } = useCtx();
  const episode = useStudio(studio, (s) => !!s.episodeView);
  return episode ? <EpisodeView /> : <Timeline />;
}

function TopBar({ onTogglePanel, panels }: { onTogglePanel: (k: 'left' | 'right' | 'timeline') => void; panels: { left: boolean; right: boolean; timeline: boolean } }) {
  const { studio, openExport, openVoiceDesigner, openVersions, importPackage } = useCtx();
  const { resolved, setTheme } = useTheme();
  const toasts = useToasts();
  const project = useStudio(studio, (s) => s.project)!;
  const save = useStudio(studio, (s) => s.save);
  const mode = useStudio(studio, (s) => s.mode);
  const canUndo = useStudio(studio, (s) => s.canUndo);
  const canRedo = useStudio(studio, (s) => s.canRedo);
  const undoLabel = useStudio(studio, (s) => s.undoLabel);
  const redoLabel = useStudio(studio, (s) => s.redoLabel);
  const sceneId = useStudio(studio, (s) => s.scene);
  const connected = useStudio(studio, (s) => s.connected);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const episode = sceneId ? project.episodes[project.sceneEpisode[sceneId] ?? ''] : undefined;
  const sel = useStudio(studio, (s) => s.selection);
  const hasSel = sel.some((x) => x.kind === 'instance' || x.kind === 'clip');

  const menus: { id: string; label: string; items: MenuEntry[] }[] = [
    { id: 'file', label: 'File', items: [
      { id: 'home', label: 'Projects…', onSelect: () => (location.hash = '#/') },
      { id: 'save', label: 'Save now', shortcut: 'Ctrl S', onSelect: () => void import('../lib/api.js').then(({ api }) => api.save(studio.state.pid)) },
      { id: 'versions', label: 'Versions…', onSelect: openVersions },
      { kind: 'separator', id: 's1' },
      { id: 'import-pkg', label: 'Import package…', onSelect: importPackage },
      { id: 'export-proj', label: 'Export project package (.frameproj)', onSelect: () => (location.href = api.projectPackageUrl(studio.state.pid)) },
      { kind: 'separator', id: 's2' },
      { id: 'export', label: 'Export…', shortcut: 'Ctrl E', onSelect: openExport },
    ] },
    { id: 'edit', label: 'Edit', items: [
      { id: 'undo', label: undoLabel ? `Undo ${undoLabel}` : 'Undo', shortcut: 'Ctrl Z', disabled: !canUndo, disabledReason: 'Nothing to undo', onSelect: () => void studio.undo() },
      { id: 'redo', label: redoLabel ? `Redo ${redoLabel}` : 'Redo', shortcut: 'Ctrl Shift Z', disabled: !canRedo, disabledReason: 'Nothing to redo', onSelect: () => void studio.redo() },
      { kind: 'separator', id: 's1' },
      { id: 'dup', label: 'Duplicate', shortcut: 'Ctrl D', disabled: !hasSel, disabledReason: 'Select an object or clip', onSelect: () => void duplicateSelection(studio) },
      { id: 'del', label: 'Delete', shortcut: 'Delete', disabled: !hasSel, disabledReason: 'Select an object or clip', onSelect: () => void deleteSelection(studio) },
    ] },
    { id: 'view', label: 'View', items: [
      { id: 'left', label: 'Left panel', checked: panels.left, onSelect: () => onTogglePanel('left') },
      { id: 'right', label: 'Properties panel', checked: panels.right, onSelect: () => onTogglePanel('right') },
      { id: 'tl', label: 'Timeline', checked: panels.timeline, onSelect: () => onTogglePanel('timeline') },
      { kind: 'separator', id: 's1' },
      { id: 'theme', label: resolved === 'dark' ? 'Light theme' : 'Dark theme', onSelect: () => setTheme(resolved === 'dark' ? 'light' : 'dark') },
      { kind: 'separator', id: 's2' },
      { id: 'library', label: 'Asset library', onSelect: () => (location.hash = `#/p/${encodeURIComponent(studio.state.pid)}/library`) },
    ] },
    { id: 'scene', label: 'Scene', items: [
      { id: 'voice', label: 'Design a voice…', onSelect: () => openVoiceDesigner(undefined) },
      { id: 'tpl-save-ep', label: 'Save episode as template…', disabled: !scene, disabledReason: 'Open a scene first', onSelect: () => saveSceneAsTemplate(studio, (message) => toasts.show({ tone: 'success', message }), 'episode') },
      { id: 'episode-view', label: 'Episode view', checked: !!studio.state.episodeView, onSelect: () => studio.set({ episodeView: !studio.state.episodeView }) },
      { id: 'tpl-save', label: 'Save scene as template…', disabled: !scene, disabledReason: 'Open a scene first', onSelect: () => saveSceneAsTemplate(studio, (message) => toasts.show({ tone: 'success', message })) },
      { kind: 'separator', id: 's-go' },
      ...project.project.episodes.flatMap((e) => (project.episodes[e]?.scenes ?? []).map((s) => ({ id: `go-${s}`, label: `Go to ${project.scenes[s]?.name ?? s}`, checked: s === sceneId, onSelect: () => studio.set({ scene: s, selection: [], time: 0 }) }))),
    ] },
  ];

  return (
    <AppBar
      left={<>
        <MenuBar menus={menus} />
        <VSep />
        <Breadcrumb items={[
          { label: 'Projects', onClick: () => (location.hash = '#/') },
          { label: project.project.name, onClick: () => goToScene(studio, project.episodes[project.project.episodes[0] ?? '']?.scenes[0]) },
          ...(episode ? [{ label: episode.name, onClick: () => goToScene(studio, episode.scenes[0]) }] : []),
          ...(scene ? [{ label: scene.name }] : []),
        ]} />
        <StatusBadge tone={connected ? SAVE_TONE[save.status] : 'warning'} title={save.error}>{connected ? SAVE_LABEL[save.status] : 'Reconnecting…'}</StatusBadge>
      </>}
      center={<Tabs label="Workspace mode" value={mode} onChange={(m: Mode) => studio.set({ mode: m })} tabs={[{ value: 'stage', label: 'Stage', shortcut: '1' }, { value: 'direct', label: 'Direct', shortcut: '2' }, { value: 'edit', label: 'Edit', shortcut: '3' }]} />}
      right={<>
        <ProblemsButton />
        <ActivityButton />
        <WorkerBadge />
        <JobsButton />
        <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />
        <IconButton label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} shortcut="Ctrl Z" icon={<Undo2 size={16} />} disabled={!canUndo} disabledReason="Nothing to undo" onClick={() => void studio.undo()} />
        <IconButton label={redoLabel ? `Redo ${redoLabel}` : 'Redo'} shortcut="Ctrl Shift Z" icon={<Redo2 size={16} />} disabled={!canRedo} disabledReason="Nothing to redo" onClick={() => void studio.redo()} />
        <Button onClick={() => studio.set({ playing: !studio.state.playing })}>{studio.state.playing ? 'Stop' : 'Preview'}</Button>
        <Button variant="primary" icon={<Download size={14} />} onClick={openExport}>Export</Button>
      </>}
    />
  );
}

function ContextToolbar() {
  const { studio } = useCtx();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const sel = useStudio(studio, (s) => s.selection);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const first = sel[0];
  const inst = first?.kind === 'instance' ? scene?.instances.find((i) => i.id === first.id) : undefined;
  const clip = first?.kind === 'clip' ? scene?.clips.find((c) => c.id === first.id) : undefined;
  const name = inst?.name ?? (clip ? clip.line?.text.slice(0, 40) ?? clip.name ?? clip.asset?.split('@')[0] ?? 'Clip' : undefined);
  return (
    <Toolbar label="Selection">
      {name ? (
        <span className="st-selname"><span className="st-dot" style={{ background: inst?.kind === 'character' ? 'var(--color-cat-character, var(--color-accent))' : 'var(--color-accent)' }} />{name}</span>
      ) : (
        <span className="fr-faint">Nothing selected · click an object on the stage, in Layers or on the timeline</span>
      )}
      <ToolbarSeparator />
      <span className="fr-spacer" />
      <IconButton label="Duplicate" shortcut="Ctrl D" icon={<Copy size={15} />} disabled={!name} disabledReason="Select an object or clip" onClick={() => void duplicateSelection(studio)} />
      <IconButton label="Delete" shortcut="Delete" icon={<Trash2 size={15} />} disabled={!name} disabledReason="Select an object or clip" onClick={() => void deleteSelection(studio)} />
    </Toolbar>
  );
}

function goToScene(studio: Studio, scene: string | undefined) {
  if (scene) studio.set({ scene, selection: [], time: 0, playing: false });
}

export async function deleteSelection(studio: Studio) {
  const s = studio.state;
  if (!s.scene) return;
  const clips = s.selection.filter((x) => x.kind === 'clip').map((x) => x.id);
  const cmds = [
    ...s.selection.filter((x) => x.kind === 'instance').map((x) => ({ name: 'instance.remove', params: { scene: s.scene, id: x.id } })),
    ...(clips.length ? [{ name: 'clip.remove', params: { scene: s.scene, ids: clips, ...(s.ripple ? { ripple: true } : {}) } }] : []),
  ];
  if (cmds.length) {
    await studio.exec(cmds);
    studio.set({ selection: [] });
  }
}

export async function duplicateSelection(studio: Studio) {
  const s = studio.state;
  if (!s.scene) return;
  const cmds = s.selection.flatMap((x) => (x.kind === 'clip' ? [{ name: 'clip.duplicate', params: { scene: s.scene, id: x.id } }] : []));
  const insts = s.selection.filter((x) => x.kind === 'instance').map((x) => s.project!.scenes[s.scene!]!.instances.find((i) => i.id === x.id)!).filter(Boolean);
  for (const i of insts) {
    const { id: _id, ...rest } = i;
    cmds.push({ name: 'instance.add', params: { scene: s.scene, ...rest, name: `${i.name} copy`, transform: { ...i.transform, x: i.transform.x + 40 } } as never });
  }
  if (cmds.length) await studio.exec(cmds, 'Duplicate');
}

function useShortcuts(setPanels: (fn: (p: { left: boolean; right: boolean; timeline: boolean }) => { left: boolean; right: boolean; timeline: boolean }) => void) {
  const { studio, openExport } = useCtx();
  const ref = useRef(studio);
  ref.current = studio;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Shortcuts never fire while typing (Design System §8).
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.getAttribute('role') === 'slider')) return;
      const st = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const fps = st.state.project?.project.frameRate ?? 24;
      const step = Math.round(48000 / fps);
      const dur = st.state.scene ? st.state.project?.scenes[st.state.scene]?.duration ?? 0 : 0;
      const seek = (t2: number) => st.set({ time: Math.max(0, Math.min(Math.max(0, dur - 1), t2)), playing: false });
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void (e.shiftKey ? st.redo() : st.undo());
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void duplicateSelection(st);
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        openExport();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void import('../lib/api.js').then(({ api }) => api.save(st.state.pid));
      } else if (e.key === ' ' && e.shiftKey) {
        // Play from the selection (FR-TML-05): from the earliest selected clip.
        e.preventDefault();
        const scene = st.state.scene ? st.state.project!.scenes[st.state.scene] : undefined;
        const starts = st.state.selection.filter((x) => x.kind === 'clip').map((x) => scene?.clips.find((c) => c.id === x.id)?.start).filter((v): v is number => v !== undefined);
        st.set({ ...(starts.length ? { time: Math.min(...starts) } : {}), playing: true });
      } else if (e.key === ' ') {
        e.preventDefault();
        st.set({ playing: !st.state.playing });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        void deleteSelection(st);
      } else if (e.key === 'ArrowLeft') seek(st.state.time - (e.shiftKey ? 48000 : step));
      else if (e.key === 'ArrowRight') seek(st.state.time + (e.shiftKey ? 48000 : step));
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(dur - 1);
      else if (!mod && (e.key === '1' || e.key === '2' || e.key === '3')) st.set({ mode: (['stage', 'direct', 'edit'] as const)[Number(e.key) - 1]! });
      else if (e.key === '\\') setPanels((p) => ({ left: !p.left, right: !p.right, timeline: p.timeline }));
      else if (e.key === 'Escape') st.set({ selection: [] });
      else if (!mod && st.state.scene && (e.key === 's' || e.key === 'S')) {
        // Split the selected clips at the playhead (FR-TML-02).
        const scene = st.state.project!.scenes[st.state.scene]!;
        const t = st.state.time;
        const ids = st.state.selection.filter((x) => x.kind === 'clip').map((x) => x.id).filter((id) => { const c = scene.clips.find((y) => y.id === id); return c && !c.line && t > c.start && t < c.end; });
        if (ids.length) void st.exec(ids.map((id) => ({ name: 'clip.split', params: { scene: scene.id, id, at: t } })), ids.length === 1 ? 'Split clip' : `Split ${ids.length} clips`);
      } else if (!mod && st.state.scene && (e.key === 'm' || e.key === 'M')) {
        // Marker at the playhead (FR-TML-04).
        const scene = st.state.project!.scenes[st.state.scene]!;
        void st.exec([{ name: 'marker.add', params: { scene: scene.id, name: `Marker ${scene.markers.length + 1}`, at: st.state.time } }]);
      } else if (!mod && st.state.scene && (e.key === 'i' || e.key === 'o')) {
        // Loop in/out points (FR-TML-04).
        const scene = st.state.project!.scenes[st.state.scene]!;
        const t = st.state.time;
        const cur = scene.loop ?? { start: 0, end: scene.duration };
        const next = e.key === 'i' ? { start: t, end: Math.max(t + step, cur.end) } : { start: Math.min(cur.start, t - step), end: t };
        void st.exec([{ name: 'scene.setLoop', params: { id: scene.id, start: Math.max(0, next.start), end: next.end } }], e.key === 'i' ? 'Set loop in' : 'Set loop out');
      } else if (!mod && (e.key === 'k' || e.key === 'K')) st.set({ playing: false });
      else if (!mod && (e.key === 'l' || e.key === 'L')) st.set({ playing: true });
      else if (!mod && (e.key === 'j' || e.key === 'J')) seek(st.state.time - 48000);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [openExport, setPanels]);
}
