/**
 * Character builder (Design System §7.2, FR-BLD-01..08): parts tree with search over names and current values, live
 * preview in every view and family with framing and a turnaround sheet, expression / gesture / lip-sync tests, and a
 * properties panel that edits a local draft. "Save version" turns the draft into a new immutable character version
 * (or a new character when the source is a library character) and, if asked, switches usages (FR-CHR-10).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Moon, Redo2, Shuffle, Sun, Undo2 } from 'lucide-react';
import { evaluateFrame, type CharacterData, type ProjectState } from '@frame/core';
import type { Alignment, AssetManifest, Clip, Instance, Scene, Take, View } from '@frame/schema';
import {
  AppBar, Breadcrumb, Button, Chip, Dialog, EmptyState, IconButton, Panel, RadioList, SearchField, Segmented, Select, StatusBadge, Toolbar, ToolbarSeparator,
  Tree, useTheme, useToasts, VSep, type EditPhase, type TreeNode,
} from '@frame/ui';
import type { Renderer } from '@frame/render';
import { blit, getRenderer, getStyles } from '../lib/preview.js';
import { api, type CharacterCheckResult } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { changedNodes, draftSpec, initDraft, randomise, sameDraft, clone, GARMENT_SLOTS, type Draft } from '../lib/builder.js';
import { BuilderProperties, loadKind, useKind, type PropsContext } from './BuilderProperties.js';
import { useCtx } from './Workspace.js';

type Frame = 'full' | 'upper' | 'face';
type Scope = 'none' | 'instance' | 'scene' | 'project';
const VIEWS: { value: View; label: string }[] = [{ value: 'front', label: 'Front' }, { value: 'three', label: '¾' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }];
const SHEET_LABEL: Record<View, string> = { front: 'Front', three: 'Three-quarter', side: 'Side', back: 'Back' };
const MOUTH_NAMES: Record<string, string> = { X: 'rest', A: 'M B P', B: 'K S T', C: 'E', D: 'A', E: 'O', F: 'U W', G: 'F V', H: 'L' };

/** A labelled test pattern for the lip-sync test (not speech): phonemes of "Hello, this is a lip sync test." */
function testAlignment(): Alignment {
  const ph = ['HH', 'AH', 'L', 'OW', 'DH', 'IH', 'S', 'IH', 'Z', 'AH', 'L', 'IH', 'P', 'S', 'IH', 'NG', 'K', 'T', 'EH', 'S', 'T', 'M', 'AA', 'F', 'UW'];
  return { method: 'fixture', confidence: 1, words: [], phonemes: ph.map((p, i) => ({ p, start: 0.2 + i * 0.11, end: 0.2 + (i + 1) * 0.11 })) };
}

const nice = (s: string) => s.replace(/^./, (m) => m.toUpperCase());

export function Builder({ scene: sceneId, instance }: { scene: string; instance: string }) {
  const { studio, assets } = useCtx();
  const toasts = useToasts();
  const { resolved, setTheme } = useTheme();
  const project = useStudio(studio, (s) => s.project)!;
  const pid = useStudio(studio, (s) => s.pid);
  const scene = project.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instance);

  const [view, setView] = useState<View>(inst?.character?.view ?? 'three');
  const [frame, setFrame] = useState<Frame>('full');
  const [sheet, setSheet] = useState(false);
  const [family, setFamily] = useState(project.project.styleFamily);
  const [expression, setExpression] = useState('');
  const [gesture, setGesture] = useState('');
  const [lipT, setLipT] = useState<number | null>(null);
  const [mouth, setMouth] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(new Set(['char', 'head', 'hair']));
  const [node, setNode] = useState('head.shape');
  const [renderer, setRenderer] = useState<Renderer>();
  const [styles, setStyles] = useState<Record<string, unknown>>();
  const [tests, setTests] = useState<{ expressions: string[]; gestures: string[] }>({ expressions: [], gestures: [] });
  const [assetVersion, setAssetVersion] = useState(0);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  // The version being edited and its draft (FR-BLD-06: unsaved changes are protected).
  const [editing, setEditing] = useState<string | undefined>(inst?.asset);
  const [base, setBase] = useState<AssetManifest>();
  const [saved, setSaved] = useState<Draft>();
  const [draft, setDraft] = useState<Draft>();
  const [undo, setUndo] = useState<Draft[]>([]);
  const [redo, setRedo] = useState<Draft[]>([]);
  const pendingBase = useRef<Draft | null>(null);
  const [lookId, setLookId] = useState<string>();
  const [check, setCheck] = useState<CharacterCheckResult>();
  const [checkOpen, setCheckOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('instance');
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [seed, setSeed] = useState(1);
  const [usedIn, setUsedIn] = useState('—');

  useEffect(() => {
    void getRenderer().then(setRenderer);
    void getStyles().then((s) => setStyles(s as never));
    void assets.prefetchScene(sceneId);
    void api.libraryDefaults().then((d) => d.builderTests && setTests(d.builderTests)).catch(() => undefined);
    const off = assets.onChange(() => setAssetVersion((v) => v + 1));
    return () => {
      off();
    };
  }, [assets, sceneId]);

  // Load the version being edited.
  useEffect(() => {
    if (!editing) return;
    let live = true;
    api.manifest(editing, pid).then((m) => {
      if (!live) return;
      const man = m as AssetManifest;
      const d = initDraft(man);
      setBase(man);
      setSaved(d);
      setDraft(clone(d));
      setUndo([]);
      setRedo([]);
      setLookId((cur) => (cur && d.data.looks.some((l) => l.id === cur) ? cur : inst?.character && d.data.looks.some((l) => l.id === inst.character!.look) ? inst.character.look : d.data.defaultLook));
    }).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
    api.usages(editing.slice(0, editing.lastIndexOf('@'))).then((u) => {
      if (!live) return;
      const mine = u.projects.find((p) => p.project === pid)?.usages.filter((x) => x.ref === editing && x.kind === 'instance') ?? [];
      const scenesN = new Set(mine.map((x) => x.scene)).size;
      setUsedIn(mine.length ? `${mine.length} instance${mine.length === 1 ? '' : 's'} · ${scenesN} scene${scenesN === 1 ? '' : 's'}` : 'Not placed in a scene');
    }).catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, pid]);

  // Make sure every asset the draft draws is in the browser cache.
  useEffect(() => {
    if (!draft) return;
    const c = draft.data;
    for (const r of [c.bodyBase, c.lifeStage, ...Object.values(c.parts), ...(c.details ?? []), ...Object.keys(c.controls), ...c.looks.flatMap((l) => [...l.garments, ...l.accessories]), ...(c.voice ? [c.voice] : [])]) if (r) assets.manifest(r);
  }, [draft, assets]);
  // Control and option assets used by the properties panel.
  useEffect(() => {
    for (const k of ['face-ctl', 'eye-ctl', 'hair-ctl', 'skin', 'body', 'stage', 'voice']) void loadKind(k, pid).then((items) => items.forEach((i) => assets.manifest(i.ref)));
  }, [assets, pid]);

  // Live rig check (FR-BLD-08), debounced.
  useEffect(() => {
    if (!draft || !editing || !base) return;
    const t = setTimeout(() => {
      api.checkCharacter(pid, { from: editing, spec: draftSpec(base, draft) }).then(setCheck).catch(() => setCheck(undefined));
    }, 350);
    return () => clearTimeout(t);
  }, [draft, editing, base, pid]);

  const dirty = !!draft && !!saved && !sameDraft(draft, saved);
  const changed = useMemo(() => (draft && saved ? changedNodes(saved, draft) : new Set<string>()), [draft, saved]);

  // Leaving with unsaved changes asks first (FR-BLD-06).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const edit = useCallback((fn: (d: Draft) => void, phase: EditPhase = 'commit') => {
    setDraft((cur) => {
      if (!cur) return cur;
      if (phase === 'preview' && !pendingBase.current) pendingBase.current = cur;
      const next = clone(cur);
      fn(next);
      if (phase === 'commit') {
        const before = pendingBase.current ?? cur;
        pendingBase.current = null;
        if (!sameDraft(before, next)) {
          setUndo((u) => [...u.slice(-199), before]);
          setRedo([]);
        }
      }
      return next;
    });
  }, []);
  const doUndo = () => {
    if (!undo.length || !draft) return;
    setRedo((r) => [...r, draft]);
    setDraft(undo.at(-1));
    setUndo((u) => u.slice(0, -1));
  };
  const doRedo = () => {
    if (!redo.length || !draft) return;
    setUndo((u) => [...u, draft]);
    setDraft(redo.at(-1));
    setRedo((r) => r.slice(0, -1));
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // Lip-sync test: plays the test pattern over 3.2 s.
  useEffect(() => {
    if (lipT === null) return;
    const t0 = performance.now() - lipT * 1000;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > 3.2) {
        setMouth(null);
        return setLipT(null);
      }
      setLipT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lipT === null]);

  const draftManifest = useMemo(() => (base && draft ? ({ ...base, name: draft.name, data: draft.data } as AssetManifest) : undefined), [base, draft]);
  const resolve = useCallback((r: string) => (inst && r === inst.asset ? draftManifest : assets.manifest(r)), [assets, draftManifest, inst]);

  const views = useMemo(() => (sheet ? VIEWS.map((v) => v.value) : [view]), [sheet, view]);
  useEffect(() => {
    if (!renderer || !styles || !scene || !inst || !draftManifest) return;
    views.forEach((v, i) => {
      const cv = canvases.current[i];
      if (!cv) return;
      const { state, t } = isolate(project, scene, inst, v, lookId ?? (draftManifest.data as CharacterData).defaultLook, expression, gesture, lipT);
      const w = sheet ? 360 : 900;
      const h = Math.round(w * (sheet ? 1.5 : 0.75));
      const probe = evaluateFrame(state, scene.id, t, { assets: { manifest: resolve }, styles: styles as never, width: 480, height: 270, family });
      const b = probe.boxes[inst.id];
      if (b) frameCamera(state, scene.id, b, frame, w / h);
      const ev = evaluateFrame(state, scene.id, t, { assets: { manifest: resolve }, styles: styles as never, width: w, height: h, family, background: '#00000000' });
      if (i === 0 && lipT !== null) setMouth(ev.mouths[inst.id] ?? 'X');
      blit(renderer, ev.frame, cv);
    });
  }, [renderer, styles, project, scene, inst, views, frame, family, expression, gesture, lipT, assetVersion, sheet, draftManifest, lookId, resolve]);

  const parts = {
    head: useKind('head', pid), eyes: useKind('eyes', pid), brows: useKind('brow', pid), nose: useKind('nose', pid), mouth: useKind('mouth', pid), ears: useKind('ears', pid), hair: useKind('hair', pid),
  };
  const skins = useKind('skin', pid);
  const bodies = useKind('body', pid);
  const exps = useKind('exp', pid);
  const acts = useKind('act', pid);
  // assetVersion: names in the tree appear as the asset cache fills.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => (draft ? partsTree(draft, lookId, resolve, changed, (r) => assets.isMissing(r)) : []), [draft, lookId, resolve, changed, assets, assetVersion]);

  if (!scene || !inst || inst.kind !== 'character') return <div className="fr-root st-app st-center"><p>This character is not in the scene.</p><Button onClick={() => history.back()}>Back</Button></div>;
  const back = () => {
    if (dirty && !window.confirm('Leave the builder? Your unsaved changes to this character will be lost.')) return;
    location.hash = `#/p/${encodeURIComponent(pid)}`;
  };
  const library = !!editing && !editing.startsWith('user.');
  const versionN = Number(editing?.split('@')[1] ?? 1);
  const nextLabel = library ? 'a new character' : `version ${versionN + 1}`;
  const look = draft?.data.looks.find((l) => l.id === lookId) ?? draft?.data.looks[0];

  const save = async () => {
    if (!draft || !base || !editing) return;
    setSaving(true);
    try {
      const r = await api.saveCharacterVersion(pid, {
        from: editing, spec: draftSpec(base, draft), ...(library ? { asNew: true } : {}),
        ...(scope !== 'none' ? { update: { scope, ...(scope !== 'project' ? { scene: sceneId } : {}), ...(scope === 'instance' ? { instance } : {}) } } : {}),
      });
      setSaveOpen(false);
      toasts.show({ tone: 'success', message: r.isNew ? `Saved ${draft.name} as a new character` : `Saved ${draft.name} version ${r.version}` });
      setEditing(r.ref);
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const doRandomise = () => {
    if (!draft) return;
    const opts = {
      parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, (v ?? []).map((x) => x.ref)])),
      skins: (skins ?? []).map((s) => (assets.manifest(s.ref)?.data as { skinTone?: { base: string } } | undefined)?.skinTone?.base).filter((x): x is string => !!x),
      hairColors: ((assets.manifest(Object.keys(draft.data.controls).find((k) => k.startsWith('hair-ctl.')) ?? '')?.data as { control?: { presets?: string[] } } | undefined)?.control?.presets) ?? [],
      bodies: (bodies ?? []).map((b) => b.ref),
      keep: { lifeStage: true, body: false, palette: false },
    };
    edit((d) => Object.assign(d, randomise(d, opts, seed)));
    setSeed((s) => s + 1);
  };

  const ctx: PropsContext | undefined = draft ? {
    pid, draft, edit, family, manifest: resolve, look, setLook: setLookId,
    versionInfo: { current: library ? 'Library character' : `Version ${versionN}${dirty ? ' · edited' : ''}`, usedIn, next: nextLabel, library },
    sectionOpen: (k) => sections[k] ?? true,
    toggleSection: (k, o) => setSections((s) => ({ ...s, [k]: o })),
  } : undefined;
  const nodeRow = nodes.find((n) => n.id === node);
  const parentRow = nodeRow?.parent && nodeRow.parent !== 'char' ? nodes.find((n) => n.id === nodeRow.parent) : undefined;
  const testOptions = (refs: string[], items: { ref: string; name: string }[] | undefined) => refs.filter((r) => items?.some((i) => i.ref === r)).map((r) => ({ ref: r, name: items!.find((i) => i.ref === r)!.name }));
  const quickExp = testOptions(tests.expressions, exps);
  const quickAct = testOptions(tests.gestures, acts);

  return (
    <div className="fr-root st-app st-builder">
      <AppBar
        left={<>
          <IconButton label="Back to the workspace" icon={<ArrowLeft size={16} />} onClick={back} />
          <VSep />
          <Breadcrumb items={[{ label: 'Cast', onClick: back }, { label: draft?.name ?? inst.name }]} />
          <StatusBadge tone={dirty ? 'warning' : 'neutral'}>{library ? 'Library' : `v${versionN}`}{dirty ? ' · edited' : ''}</StatusBadge>
        </>}
        right={<>
          <span className="fr-faint">Preview style</span>
          <Segmented label="Preview style family" value={family} onChange={setFamily} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
          <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} />
          <VSep />
          <IconButton label="Undo" shortcut="Ctrl+Z" icon={<Undo2 size={16} />} onClick={doUndo} disabled={!undo.length} disabledReason="Nothing to undo" />
          <IconButton label="Redo" shortcut="Ctrl+Shift+Z" icon={<Redo2 size={16} />} onClick={doRedo} disabled={!redo.length} disabledReason="Nothing to redo" />
          <Button icon={<Download size={14} />} onClick={() => editing && (location.href = api.packageExportUrl(pid, 'framechar', [editing]))} disabled={dirty || library} disabledReason={library ? 'Library characters ship with Frame; save your own version to export it' : 'Save the version first; exports contain saved versions only'}>Export…</Button>
          <Button variant="primary" onClick={() => { setScope('instance'); setSaveOpen(true); }} disabled={!dirty || !check?.ok} disabledReason={!dirty ? 'No changes to save' : 'Fix the rig check problems first'}>{library ? 'Save as new character' : `Save version ${versionN + 1}`}</Button>
        </>}
      />
      <div className="st-main">
        <Panel title="Parts" label="Parts" search={<SearchField label="Search parts and settings" placeholder="Search parts and settings" value={q} onChange={setQ} />} className="st-left">
          <Tree label="Character parts" nodes={nodes} expanded={expanded} onExpandedChange={setExpanded} selected={node} onSelect={(id) => setNode(id)} query={q} emptyText={`Nothing matches “${q}”.`} />
          <div className="st-panel-foot st-rigcheck">
            {check ? (
              <button type="button" className="st-linkish" onClick={() => setCheckOpen(true)} aria-label="Rig check details">
                <StatusBadge tone={check.ok ? (check.problems.length ? 'warning' : 'success') : 'danger'}>{check.ok ? 'Rig check passed' : `Rig check: ${check.problems.filter((p) => p.severity === 'error').length} problem(s)`}</StatusBadge>
                <span className="fr-faint">{check.views.length} views · {check.families.length} styles · {check.mouthShapes} mouth shapes · {check.actions.compatible} compatible actions</span>
              </button>
            ) : <span className="fr-faint">Checking…</span>}
          </div>
        </Panel>
        <div className="st-center-col">
          <Toolbar label="Preview controls">
            <span className="fr-faint">View</span>
            <Segmented label="View direction" value={view} onChange={(v) => { setView(v); setSheet(false); }} options={VIEWS} />
            <ToolbarSeparator />
            <span className="fr-faint">Frame</span>
            <Segmented label="Framing" value={frame} onChange={setFrame} options={[{ value: 'full', label: 'Full body' }, { value: 'upper', label: 'Upper' }, { value: 'face', label: 'Face' }]} />
            <ToolbarSeparator />
            <Chip selected={sheet} onClick={() => setSheet(!sheet)}>Turnaround sheet</Chip>
            <ToolbarSeparator />
            {look && draft && draft.data.looks.length > 1 && <span className="st-tb-select"><Select label="Preview look" value={look.id} onChange={setLookId} options={draft.data.looks.map((l) => ({ value: l.id, label: l.name }))} /></span>}
            <IconButton label="Randomise parts, build and colours" icon={<Shuffle size={16} />} onClick={doRandomise} disabled={!draft} disabledReason="Loading" />
          </Toolbar>
          <div className={`st-builder-canvas ${sheet ? 'st-builder-canvas--sheet' : ''}`}>
            {!draft ? <EmptyState title="Loading the character…" /> : views.map((v, i) => (
              <figure key={v} className="st-builder-view">
                <canvas ref={(el) => { canvases.current[i] = el; }} aria-label={`${draft.name}, ${SHEET_LABEL[v]} view`} role="img" />
                {sheet && <figcaption>{SHEET_LABEL[v]}</figcaption>}
              </figure>
            ))}
            <span className="st-shot">{family === 'flat' ? 'Flat style' : 'Illustrated style'}</span>
            {lipT !== null && <span className="st-quality" aria-live="polite">mouth · {MOUTH_NAMES[mouth ?? 'X'] ?? 'rest'} (test pattern)</span>}
          </div>
          <Toolbar label="Performance test" className="st-testbar">
            <Button onClick={() => (lipT === null ? setLipT(0) : setLipT(null))}>{lipT === null ? 'Test lip sync' : 'Stop lip sync test'}</Button>
            <ToolbarSeparator />
            <span className="fr-faint">Expression</span>
            <Segmented label="Test expression" value={quickExp.some((e) => e.ref === expression) || !expression ? expression : 'other'} onChange={(v) => v !== 'other' && setExpression(v)} options={[{ value: '', label: 'Neutral' }, ...quickExp.map((e) => ({ value: e.ref, label: e.name })), ...(expression && !quickExp.some((e) => e.ref === expression) ? [{ value: 'other', label: exps?.find((e) => e.ref === expression)?.name ?? 'Other' }] : [])]} />
            <span className="st-tb-select st-tb-select--more"><Select label="Any expression" placeholder="More" value={undefined} onChange={setExpression} options={(exps ?? []).map((e) => ({ value: e.ref, label: e.name }))} /></span>
            <ToolbarSeparator />
            <span className="fr-faint">Gesture</span>
            <Segmented label="Test gesture" value={quickAct.some((a) => a.ref === gesture) || !gesture ? gesture : 'other'} onChange={(v) => v !== 'other' && setGesture(v)} options={[{ value: '', label: 'Rest' }, ...quickAct.map((a) => ({ value: a.ref, label: a.name })), ...(gesture && !quickAct.some((a) => a.ref === gesture) ? [{ value: 'other', label: acts?.find((a) => a.ref === gesture)?.name ?? 'Other' }] : [])]} />
            <span className="st-tb-select st-tb-select--more"><Select label="Any gesture" placeholder="More" value={undefined} onChange={setGesture} options={(acts ?? []).map((a) => ({ value: a.ref, label: a.name }))} /></span>
          </Toolbar>
        </div>
        <Panel title={nodeRow?.label ?? 'Identity'} label="Properties" className="st-right">
          <div className="st-crumb fr-faint">{parentRow ? `${draft?.name ?? ''} / ${parentRow.label}` : draft?.name}</div>
          <div className="st-props">{ctx ? <BuilderProperties node={node === 'char' ? 'identity' : node} c={ctx} /> : <EmptyState title="Loading…" />}</div>
        </Panel>
      </div>
      <Dialog
        title={library ? 'Save as a new character' : `Save version ${versionN + 1}`}
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        footer={<><Button onClick={() => setSaveOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{library ? 'Save character' : 'Save version'}</Button></>}
      >
        <p>{library ? `${draft?.name} comes from the library and never changes. Saving creates a character of your own in this project.` : `Version ${versionN} stays as it is. Choose where version ${versionN + 1} is used now; everything else keeps version ${versionN} until you update it.`}</p>
        <RadioList label="Use the new version in" value={scope} onChange={setScope} items={[
          { value: 'instance', label: `Only ${inst.name} in this scene` },
          { value: 'scene', label: 'Every use in this scene' },
          ...(library ? [] : [{ value: 'project' as const, label: 'Everywhere in this project' }]),
          { value: 'none', label: 'Nowhere yet', meta: 'Update scenes later' },
        ]} />
      </Dialog>
      <Dialog title="Rig check" open={checkOpen} onClose={() => setCheckOpen(false)} footer={<Button onClick={() => setCheckOpen(false)}>Close</Button>}>
        {check && <>
          <p>Views: {check.views.map(nice).join(', ') || 'none'} · Styles: {check.families.map(nice).join(', ') || 'none'} · Mouth shapes: {check.mouthShapes} of 9 · Actions: {check.actions.compatible} of {check.actions.total} compatible</p>
          {check.problems.length ? <ul className="st-problems">{check.problems.map((p, i) => <li key={i}><StatusBadge tone={p.severity === 'error' ? 'danger' : 'warning'}>{p.severity === 'error' ? 'Error' : 'Warning'}</StatusBadge> {p.message}</li>)}</ul> : <p>No problems: every part follows the part contract in all views and both styles.</p>}
        </>}
      </Dialog>
    </div>
  );
}

/** A preview-only copy of the scene: just this character, on a neutral stage, with test clips. */
function isolate(project: ProjectState, scene: Scene, inst: Instance, view: View, look: string | undefined, expression: string, gesture: string, lipT: number | null): { state: ProjectState; t: number } {
  const ch: Instance = { ...inst, transform: { ...inst.transform, x: 960, y: 1000, scale: 1, flipX: false, rotation: 0 }, character: { ...inst.character!, ...(look ? { look } : {}), view, posture: 'standing', auto: { ...inst.character!.auto, idle: false, blinks: lipT === null ? inst.character!.auto.blinks : false } }, parent: undefined as never };
  const track = (kind: string) => scene.tracks.find((t) => t.owner === inst.id && t.kind === kind)!;
  const clips: Clip[] = [];
  const t = 48000;
  if (expression) clips.push({ id: 'clp_preview_exp' as never, track: track('face').id, start: 0, end: 96000, asset: expression, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual' });
  if (gesture) clips.push({ id: 'clp_preview_act' as never, track: track('acting').id, start: 0, end: 96000 * 2, asset: gesture, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual' });
  const takes: Record<string, Take> = {};
  if (lipT !== null) {
    takes['tak_preview' as never] = { schemaVersion: 1, id: 'tak_preview' as never, line: 'clp_preview_line' as never, lineRevision: 1, number: 1, source: 'recorded', fixture: true, status: 'ready', durationS: 3.2, alignment: testAlignment(), createdAt: '' } as Take;
    clips.push({ id: 'clp_preview_line' as never, track: track('dialogue').id, start: t, end: t + 3.2 * 48000, params: {}, blendIn: 0, blendOut: 0, enabled: true, source: 'manual', line: { speaker: inst.id as never, text: 'Lip sync test', revision: 1, delivery: {}, take: 'tak_preview' as never, muted: false } });
  }
  const preview: Scene = { ...scene, instances: [ch], clips, markers: [], duration: Math.max(scene.duration, 5 * 48000), cameras: [{ ...scene.cameras[0]!, id: scene.defaultCamera }], loop: undefined as never };
  return { state: { ...project, scenes: { ...project.scenes, [scene.id]: preview }, takes: { ...project.takes, ...takes } }, t: lipT !== null ? t + Math.round(lipT * 48000) : t };
}

/** Points the preview camera at the character's box (stage units) for the chosen framing. */
function frameCamera(state: ProjectState, sceneId: string, b: { x: number; y: number; w: number; h: number }, frame: Frame, aspect: number) {
  const sc = state.scenes[sceneId]!;
  // The probe rendered 480 px wide for a 1920-unit camera: 4 stage units per pixel.
  const k = 1920 / 480;
  const x = (b.x + b.w / 2) * k;
  const top = b.y * k;
  const h = b.h * k;
  const part = frame === 'full' ? { y0: 0, y1: 1, pad: 1.18 } : frame === 'upper' ? { y0: 0, y1: 0.5, pad: 1.25 } : { y0: 0, y1: 0.24, pad: 1.4 };
  const fh = h * (part.y1 - part.y0) * part.pad;
  const cy = top + h * (part.y0 + part.y1) / 2;
  const cam = sc.cameras[0]!;
  sc.cameras[0] = { ...cam, center: { x, y: cy }, width: Math.max(fh * aspect, b.w * k * 1.3), rotation: 0, lens: '35mm' };
  state.scenes[sceneId] = { ...sc, clips: sc.clips.filter((c) => sc.tracks.find((t) => t.id === c.track)?.kind !== 'shot') };
}

/** Parts tree (Design System §7.2) from the draft, with current values as metadata and changed dots. */
function partsTree(draft: Draft, lookId: string | undefined, man: (ref: string) => AssetManifest | undefined, changed: Set<string>, missing: (ref: string) => boolean): TreeNode[] {
  const d = draft.data;
  const name = (ref?: string) => (ref ? man(ref)?.name ?? (missing(ref) ? 'Missing' : '…') : 'None');
  const look = d.looks.find((l) => l.id === lookId) ?? d.looks[0];
  const kindOf = (ref: string) => man(ref)?.kind ?? ref.slice(0, ref.indexOf('.'));
  const garment = (k: string) => look?.garments.find((g) => kindOf(g) === k);
  const rows: TreeNode[] = [
    { id: 'char', label: draft.name, emphasis: 'group', searchText: d.role },
    { id: 'identity', parent: 'char', label: 'Identity', meta: name(d.lifeStage), searchText: d.role },
    { id: 'body', parent: 'char', label: 'Body', meta: name(d.bodyBase) },
    { id: 'body.base', parent: 'body', label: 'Build', meta: name(d.bodyBase) },
    { id: 'body.torso', parent: 'body', label: 'Torso' },
    { id: 'body.arms', parent: 'body', label: 'Arms and hands', meta: name(d.parts.hands) },
    { id: 'body.legs', parent: 'body', label: 'Legs and feet', meta: name(d.parts.feet) },
    { id: 'head', parent: 'char', label: 'Head and face' },
    { id: 'head.shape', parent: 'head', label: 'Face shape', meta: name(d.parts.head) },
    { id: 'head.eyes', parent: 'head', label: 'Eyes', meta: name(d.parts.eyes) },
    { id: 'head.brows', parent: 'head', label: 'Eyebrows', meta: name(d.parts.brows) },
    { id: 'head.nose', parent: 'head', label: 'Nose', meta: name(d.parts.nose) },
    { id: 'head.mouth', parent: 'head', label: 'Mouth', meta: name(d.parts.mouth) },
    { id: 'head.ears', parent: 'head', label: 'Ears', meta: name(d.parts.ears) },
    { id: 'head.skin', parent: 'head', label: 'Skin and details', meta: (d.colors.skin ?? '').toUpperCase() },
    { id: 'hair', parent: 'char', label: 'Hair', meta: name(d.parts.hair) },
    { id: 'hair.style', parent: 'hair', label: 'Hairstyle', meta: name(d.parts.hair) },
    { id: 'hair.colour', parent: 'hair', label: 'Colour', meta: (d.colors.hair ?? Object.entries(d.controls).find(([k, v]) => k.startsWith('hair-ctl.') && typeof v === 'string' && v.startsWith('#'))?.[1] as string | undefined ?? '').toUpperCase() },
    { id: 'hair.facial', parent: 'hair', label: 'Facial hair', meta: name(d.parts.facialHair) },
    { id: 'wardrobe', parent: 'char', label: 'Wardrobe', meta: look?.name },
    { id: 'wardrobe.looks', parent: 'wardrobe', label: 'Saved looks', meta: String(d.looks.length) },
    ...GARMENT_SLOTS.map(([k, label]) => ({ id: `wardrobe.${k}`, parent: 'wardrobe', label, meta: garment(k) ? name(garment(k)) : 'None' })),
    { id: 'accessories', parent: 'char', label: 'Accessories', meta: `${look?.accessories.length ?? 0} on` },
    { id: 'voice', parent: 'char', label: 'Voice', meta: d.voice ? name(d.voice) : 'None' },
    { id: 'voice.asset', parent: 'voice', label: 'Voice asset', meta: d.voice ? `v${d.voice.split('@')[1]}` : 'None' },
    { id: 'performance', parent: 'char', label: 'Performance defaults' },
  ];
  return rows.map((x) => ({ ...x, changed: changed.has(x.id), emphasis: x.emphasis ?? (x.id.includes('.') ? 'leaf' : 'group'), searchText: [x.searchText, typeof x.meta === 'string' ? x.meta : ''].filter(Boolean).join(' ') }));
}
