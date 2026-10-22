/**
 * Full-page asset library (Design System §5.3, §7.3; FR-AST-01..07): search across names, tags and synonyms;
 * categories with counts; filters for style family, view, source and favourites; grid or list with real previews in
 * the active family; asset details with versions and their changes, where each version is used in this project with
 * explicit, undoable "update to the latest version", licence and provenance, and the rig check for parts.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, LayoutGrid, List, Star } from 'lucide-react';
import type { StyleFamily } from '@frame/schema';
import { AppBar, AssetRow, Breadcrumb, Button, EmptyState, IconButton, Panel, SearchField, Section, Segmented, Select, StatusBadge, Tree, VSep, useToasts, type TreeNode } from '@frame/ui';
import { api, type UserPrefs } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Hit { ref: string; kind: string; name: string; category: string; group?: string; tags: string[]; preview?: boolean; incompatible?: string; source?: string }
interface Details {
  ref: string;
  source: string;
  latest: string;
  hash: string;
  manifest: { id: string; version: number; kind: string; name: string; category: string; group?: string; tags: string[]; synonyms: string[]; families: string[]; views: string[]; viewExemptions: Record<string, string>; license: { id: string; redistributable: boolean; commercialUse: boolean; attribution?: string }; provenance: { method: string; author: string; date: string; sourceFile?: string; rightsStatement?: string; notes?: string }; review?: { status: string }; changes?: string };
  versions: { version: number; ref: string; changes: string | null; date: string; draft: boolean }[];
  usages: { ref: string; scene: string; sceneName: string; kind: string; id: string; name: string }[];
  rigCheck: { severity: string; family?: string; view?: string; message: string }[] | null;
}

const PART_KINDS = new Set(['head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'feet', 'top', 'outer', 'bottom', 'dress', 'shoe', 'acc', 'skin-detail', 'makeup']);
const idOf = (ref: string) => ref.slice(0, ref.lastIndexOf('@'));

export function LibraryScreen() {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<StyleFamily>(project.project.styleFamily);
  const [view, setView] = useState('');
  const [source, setSource] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [category, setCategory] = useState<string>();
  const [hits, setHits] = useState<Hit[]>();
  const [picked, setPicked] = useState<string>();
  const [details, setDetails] = useState<Details>();
  const [prefs, setPrefs] = useState<UserPrefs>();
  const [expanded, setExpanded] = useState(new Set(['all']));
  const [sections, setSections] = useState<Record<string, boolean>>({});
  // New project assets (saved parts, imports) refresh the listing.
  const assetCount = Object.keys(project.assets).length;

  const [problems, setProblems] = useState<{ file: string; message: string }[]>([]);
  useEffect(() => {
    api.prefs().then(setPrefs).catch(() => setPrefs(undefined));
    // Manifests that failed validation are excluded and reported (FR-AST-02).
    fetch(`/api/library/problems?project=${encodeURIComponent(pid)}`).then((r) => r.json()).then((r: { problems: { file: string; message: string }[] }) => setProblems(r.problems)).catch(() => undefined);
  }, [pid]);
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ q, project: pid, limit: '500', family, ...(view ? { view } : {}), ...(source ? { source } : {}) });
    fetch(`/api/library?${qs}`).then((r) => r.json()).then((r: { results: Hit[] }) => live && setHits(r.results.filter((h) => h.kind !== 'base' && h.kind !== 'out'))).catch(() => live && setHits([]));
    return () => {
      live = false;
    };
  }, [q, family, view, source, pid, assetCount]);
  useEffect(() => {
    if (!picked) return setDetails(undefined);
    let live = true;
    fetch(`/api/library/details?ref=${encodeURIComponent(picked)}&project=${encodeURIComponent(pid)}`).then((r) => r.json()).then((d: Details) => live && setDetails(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [picked, pid, project]);

  const shown = useMemo(() => (hits ?? []).filter((h) => (!category || h.category === category) && (!favOnly || prefs?.favourites.includes(idOf(h.ref)))), [hits, category, favOnly, prefs]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of hits ?? []) if (!favOnly || prefs?.favourites.includes(idOf(h.ref))) m.set(h.category, (m.get(h.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [hits, favOnly, prefs]);
  const nodes: TreeNode[] = [{ id: 'all', label: 'All assets', meta: String(counts.reduce((n, [, c]) => n + c, 0)), emphasis: 'group' }, ...counts.map(([c, n]) => ({ id: `cat:${c}`, parent: 'all', label: c, meta: String(n), emphasis: 'leaf' as const }))];
  const back = () => (location.hash = `#/p/${encodeURIComponent(pid)}`);
  const thumb = (ref: string, w = 120) => `/api/library/thumbnail?ref=${encodeURIComponent(ref)}&family=${family}&w=${w}&project=${encodeURIComponent(pid)}`;
  const fav = details ? prefs?.favourites.includes(idOf(details.ref)) : false;
  const toggleFav = () => {
    if (!prefs || !details) return;
    const id = idOf(details.ref);
    void api.setPrefs({ favourites: fav ? prefs.favourites.filter((x) => x !== id) : [...prefs.favourites, id], collections: prefs.collections }).then(setPrefs);
  };
  const updateUsage = async (u: Details['usages'][number], scope: 'instance' | 'scene' | 'project') => {
    if (!details) return;
    await studio.exec([{ name: 'asset.updateUsages', params: { from: u.ref, to: details.latest, scope, ...(scope !== 'project' ? { scene: u.scene } : {}), ...(scope === 'instance' ? { instance: u.id } : {}) } }], `Update to ${details.latest}`);
    toasts.show({ tone: 'success', message: `Updated ${scope === 'instance' ? u.name : scope === 'scene' ? `scene ${u.sceneName}` : 'the project'} to version ${details.latest.split('@')[1]}. Undo reverts it.` });
  };
  const exportFormat = details?.manifest.kind === 'chr' ? 'framechar' : details?.manifest.kind === 'voice' ? 'framevoice' : 'frameasset';
  const sec = (k: string) => sections[k] ?? true;
  const tog = (k: string, o: boolean) => setSections((s) => ({ ...s, [k]: o }));

  return (
    <div className="fr-root st-app st-builder st-library">
      <AppBar
        left={<>
          <IconButton label="Back to the workspace" icon={<ArrowLeft size={16} />} onClick={back} />
          <VSep />
          <Breadcrumb items={[{ label: project.project.name, onClick: back }, { label: 'Library' }]} />
        </>}
        center={<div className="st-library__search"><SearchField label="Search the library" placeholder="Search names, tags and synonyms — type:hair style:flat view:side" value={q} onChange={setQ} /></div>}
        right={<>
          <span className="fr-faint">Previews</span>
          <Segmented label="Preview style family" value={family} onChange={setFamily} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} />
        </>}
      />
      <div className="st-main">
        <Panel title="Categories" label="Categories" className="st-left">
          <Tree label="Categories" nodes={nodes} expanded={expanded} onExpandedChange={setExpanded} selected={category ? `cat:${category}` : 'all'} onSelect={(id) => setCategory(id === 'all' ? undefined : id.slice(4))} />
          <div className="st-form">
            <span className="fr-label">View</span>
            <Select label="View support" value={view} onChange={setView} options={[{ value: '', label: 'Any view' }, { value: 'front', label: 'Front' }, { value: 'three', label: 'Three-quarter' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} />
            <span className="fr-label">Source</span>
            <Select label="Source" value={source} onChange={setSource} options={[{ value: '', label: 'All sources' }, { value: 'bundled', label: 'Bundled with Frame' }, { value: 'user', label: 'My library' }, { value: 'project', label: 'This project' }]} />
            <Button icon={<Star size={14} />} aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}>{favOnly ? 'Showing favourites' : 'Favourites only'}</Button>
          </div>
        </Panel>
        <div className="st-center-col">
          {problems.length > 0 && (
            <details className="st-library__problems" role="status">
              <summary>{problems.length} asset file(s) could not be loaded and are not offered</summary>
              <ul className="st-problems">{problems.slice(0, 50).map((x) => <li key={x.file}><span className="fr-mono">{x.file.split(/[\\/]/).slice(-2).join('/')}</span>: {x.message}</li>)}</ul>
            </details>
          )}
          <div className="st-library__bar">
            <span className="fr-faint">{shown.length} item{shown.length === 1 ? '' : 's'}{category ? ` in ${category}` : ''}</span>
            <span className="fr-spacer" />
            <IconButton label="Grid" pressed={layout === 'grid'} icon={<LayoutGrid size={16} />} onClick={() => setLayout('grid')} />
            <IconButton label="List" pressed={layout === 'list'} icon={<List size={16} />} onClick={() => setLayout('list')} />
          </div>
          <div className={`st-library__items st-library__items--${layout}`} role="list" aria-label="Assets">
            {hits === undefined ? <p className="fr-faint">Loading…</p> : !shown.length ? <EmptyState title="Nothing matches">Try other words or filters.</EmptyState> : layout === 'grid' ? shown.slice(0, 300).map((h) => (
              <div key={h.ref} role="listitem" aria-label={h.name}>
                <button type="button" className="st-library__tile" aria-pressed={picked === h.ref} onClick={() => setPicked(h.ref)} title={h.incompatible ?? h.name}>
                  <span className="st-library__thumb" aria-hidden>{h.preview ? <img src={thumb(h.ref)} alt="" width={96} height={96} loading="lazy" /> : <span className="fr-faint">{h.kind}</span>}</span>
                  <span className="st-library__name">{h.name}</span>
                  <span className="fr-faint st-library__meta">{h.source === 'bundled' ? h.group ?? h.category : h.source === 'user' ? 'My library' : 'Project'}</span>
                </button>
              </div>
            )) : shown.slice(0, 300).map((h) => <div role="listitem" key={h.ref}><AssetRow name={h.name} meta={`${h.category} · ${h.ref}`} selected={picked === h.ref} onClick={() => setPicked(h.ref)} thumbnail={h.preview ? <img src={thumb(h.ref, 60)} width={30} height={30} alt="" loading="lazy" /> : undefined} /></div>)}
          </div>
        </div>
        <Panel title={details?.manifest.name ?? 'Details'} label="Asset details" className="st-right">
          {!details ? <EmptyState title="Choose an asset">Pick an item to see its versions, where it is used, its licence and provenance.</EmptyState> : (
            <div className="st-props">
              <div className="st-form">
                {PART_KINDS.has(details.manifest.kind) || details.manifest.kind === 'chr' ? <img className="st-library__big" src={thumb(details.ref, 240)} alt={`${details.manifest.name} preview`} /> : null}
                <div className="st-buttons">
                  {prefs && <Button icon={<Star size={14} />} aria-pressed={fav} onClick={toggleFav}>{fav ? 'Favourite' : 'Add to favourites'}</Button>}
                  {PART_KINDS.has(details.manifest.kind) && <Button onClick={() => (location.hash = `#/p/${encodeURIComponent(pid)}/part/${encodeURIComponent(details.ref)}`)}>Open in part editor</Button>}
                  <Button icon={<Download size={14} />} onClick={() => (location.href = api.packageExportUrl(pid, exportFormat, [details.ref]))} disabled={details.source === 'bundled'} disabledReason="Bundled assets ship with Frame; packages carry them by reference">Export</Button>
                  {details.source === 'project' && <Button onClick={() => void api.saveToLibrary(pid, [details.ref]).then(() => toasts.show({ tone: 'success', message: `Saved ${details.manifest.name} to your library` })).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }))}>Save to my library</Button>}
                </div>
              </div>
              <Section title="About" open={sec('about')} onToggle={(o) => tog('about', o)}>
                <div className="st-kv"><span className="fr-faint">ID</span><span className="fr-mono">{details.ref}</span></div>
                <div className="st-kv"><span className="fr-faint">Source</span><span>{details.source === 'bundled' ? 'Bundled with Frame' : details.source === 'user' ? 'My library' : 'This project'}</span></div>
                <div className="st-kv"><span className="fr-faint">Category</span><span>{details.manifest.category}{details.manifest.group ? ` · ${details.manifest.group}` : ''}</span></div>
                {details.manifest.families.length > 0 && <div className="st-kv"><span className="fr-faint">Styles</span><span>{details.manifest.families.join(', ')}</span></div>}
                {details.manifest.views.length > 0 && <div className="st-kv"><span className="fr-faint">Views</span><span>{details.manifest.views.join(', ')}{Object.keys(details.manifest.viewExemptions).length ? ` (exempt: ${Object.keys(details.manifest.viewExemptions).join(', ')})` : ''}</span></div>}
                {details.manifest.tags.length > 0 && <div className="st-kv"><span className="fr-faint">Tags</span><span>{details.manifest.tags.join(', ')}</span></div>}
                {details.manifest.review && <div className="st-kv"><span className="fr-faint">Visual review</span><StatusBadge tone={details.manifest.review.status === 'approved' ? 'success' : 'warning'}>{details.manifest.review.status}</StatusBadge></div>}
              </Section>
              <Section title="Versions" summary={`${details.versions.length} · latest v${details.latest.split('@')[1]}`} open={sec('versions')} onToggle={(o) => tog('versions', o)}>
                <ul className="st-problems" aria-label="Versions">
                  {[...details.versions].reverse().map((v) => <li key={v.ref}><b>v{v.version}</b> {v.date}{v.draft ? ' · draft' : ''}{v.changes ? ` — ${v.changes}` : ''}{v.ref === details.ref ? ' (shown)' : ''}</li>)}
                </ul>
              </Section>
              <Section title="Used in this project" summary={String(details.usages.length)} open={sec('usages')} onToggle={(o) => tog('usages', o)}>
                {!details.usages.length ? <p className="fr-hint">Not used in this project.</p> : (
                  <>
                    <ul className="st-library__usages" aria-label="Usages">
                      {details.usages.map((u) => (
                        <li key={`${u.kind}:${u.id}:${u.ref}`}>
                          <span>{u.sceneName ? `${u.sceneName} / ` : ''}{u.name} <span className="fr-faint">· {u.kind} · v{u.ref.split('@')[1]}</span></span>
                          {u.ref !== details.latest && u.kind !== 'cast' && <Button onClick={() => void updateUsage(u, u.kind === 'instance' ? 'instance' : 'scene')}>Update to v{details.latest.split('@')[1]}</Button>}
                        </li>
                      ))}
                    </ul>
                    {details.usages.some((u) => u.ref !== details.latest && u.kind !== 'cast') && <Button onClick={() => void updateUsage(details.usages.find((u) => u.ref !== details.latest)!, 'project')}>Update every use to v{details.latest.split('@')[1]}</Button>}
                    <p className="fr-hint">Updating is explicit and undoable; scenes keep their version until you update them (P5).</p>
                  </>
                )}
              </Section>
              <Section title="Licence and provenance" open={sec('licence')} onToggle={(o) => tog('licence', o)}>
                <div className="st-kv"><span className="fr-faint">Licence</span><span>{details.manifest.license.id}</span></div>
                <div className="st-kv"><span className="fr-faint">Commercial use</span><span>{details.manifest.license.commercialUse ? 'Yes' : 'No'}</span></div>
                <div className="st-kv"><span className="fr-faint">Made by</span><span>{details.manifest.provenance.author} · {details.manifest.provenance.method} · {details.manifest.provenance.date}</span></div>
                {details.manifest.provenance.sourceFile && <div className="st-kv"><span className="fr-faint">Source file</span><span>{details.manifest.provenance.sourceFile}</span></div>}
                {details.manifest.provenance.rightsStatement && <div className="st-kv"><span className="fr-faint">Rights</span><span>{details.manifest.provenance.rightsStatement}</span></div>}
                {details.manifest.license.attribution && <p className="fr-hint">{details.manifest.license.attribution}</p>}
              </Section>
              {details.rigCheck && (
                <Section title="Rig check" summary={details.rigCheck.some((i) => i.severity === 'error') ? 'Problems' : 'Passed'} open={sec('rig')} onToggle={(o) => tog('rig', o)}>
                  {details.rigCheck.length ? <ul className="st-problems">{details.rigCheck.map((i, n) => <li key={n}>{i.severity}: {[i.family, i.view].filter(Boolean).join(' · ')} {i.message}</li>)}</ul> : <p>Follows the part contract in both families and every view.</p>}
                </Section>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
