/**
 * Builder properties panel (Design System §7.2, FR-BLD-02/07): collapsible sections of radio lists, preset tiles
 * rendered from the library, swatch grids, slider rows and toggles. Every option comes from the asset library
 * (FR-ARC-06); empty categories say so instead of showing placeholder controls (UI-06).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Play, Shuffle, Square } from 'lucide-react';
import type { CharacterData, LookData } from '@frame/core';
import type { AssetManifest } from '@frame/schema';
import { Button, Chip, EmptyState, IconButton, RadioList, Section, Segmented, Select, SliderRow, StatusBadge, SwatchGrid, TextArea, TextField, TileGrid, ToggleRow, type EditPhase } from '@frame/ui';
import { api } from '../lib/api.js';
import { ARMS, BODY_DEFAULTS, GARMENT_SLOTS, LEGS, TORSO, newLookId, type Draft, type RandomiseKeep } from '../lib/builder.js';

export interface LibraryItem {
  ref: string;
  kind: string;
  name: string;
  group?: string;
  preview?: boolean;
  tags?: string[];
}

const kindCache = new Map<string, Promise<LibraryItem[]>>();
/** Latest versions of a library kind (bundled, user and project sources). */
export function loadKind(kind: string, pid: string): Promise<LibraryItem[]> {
  const key = `${pid}:${kind}`;
  if (!kindCache.has(key)) kindCache.set(key, api.library('', kind, pid, 500).then((r) => r.results.map((x) => ({ ref: x.ref, kind: x.kind, name: x.name, ...(x.group ? { group: x.group } : {}), ...(x.preview ? { preview: true } : {}), ...(x.tags.length ? { tags: x.tags } : {}) }))).catch(() => []));
  return kindCache.get(key)!;
}
export function forgetKinds() {
  kindCache.clear();
}

export function useKind(kind: string, pid: string): LibraryItem[] | undefined {
  const [items, setItems] = useState<LibraryItem[]>();
  useEffect(() => {
    let live = true;
    void loadKind(kind, pid).then((x) => live && setItems(x));
    return () => {
      live = false;
    };
  }, [kind, pid]);
  return items;
}

export interface PropsContext {
  pid: string;
  draft: Draft;
  /** Applies an edit; `phase` 'preview' updates the preview without a history step (sliders while dragging). */
  edit: (fn: (d: Draft) => void, phase?: EditPhase) => void;
  family: string;
  manifest: (ref: string) => AssetManifest | undefined;
  look: LookData | undefined;
  setLook: (id: string) => void;
  versionInfo: { current: string; usedIn: string; next: string; library: boolean };
  /** Randomise within constraints (FR-BLD-05). */
  randomise?: { keep: RandomiseKeep; setKeep: (k: RandomiseKeep) => void; run: () => void };
  sectionOpen: (key: string) => boolean;
  toggleSection: (key: string, open: boolean) => void;
}

const thumb = (pid: string, ref: string, family: string, w = 96) => `/api/library/thumbnail?ref=${encodeURIComponent(ref)}&family=${family}&w=${w}&project=${encodeURIComponent(pid)}`;

function Sec({ k, title, summary, children, c }: { k: string; title: string; summary?: ReactNode; children: ReactNode; c: PropsContext }) {
  return <Section id={k} title={title} summary={summary} open={c.sectionOpen(k)} onToggle={(o) => c.toggleSection(k, o)}>{children}</Section>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="fr-hint st-note">{children}</p>;
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return <div className="st-kv"><span className="fr-faint">{k}</span><span>{v}</span></div>;
}

/** Part choice as preview tiles (rendered on the library preview character) or a radio list. */
function PartPicker({ c, kind, partKey, label, optional, tiles }: { c: PropsContext; kind: string; partKey: string; label: string; optional?: boolean; tiles?: boolean }) {
  const items = useKind(kind, c.pid);
  const value = c.draft.data.parts[partKey] ?? '';
  if (!items) return <Note>Loading {label.toLowerCase()}…</Note>;
  const set = (v: string) => c.edit((d) => {
    if (v === '') delete d.data.parts[partKey];
    else d.data.parts[partKey] = v;
  });
  if (!items.length && !optional) return <EmptyState title={`No ${label.toLowerCase()} in the library`}>Import or create one in the part editor.</EmptyState>;
  if (!items.length) return <><RadioList label={label} items={[{ value: '', label: 'None' }]} value="" onChange={set} /><Note>The library has no {label.toLowerCase()} yet.</Note></>;
  const opts = [...(optional ? [{ value: '', label: 'None' }] : []), ...items.map((i) => ({ value: i.ref, label: i.name, ...(i.group ? { meta: i.group } : {}) }))];
  const editLink = value ? <Button onClick={() => (location.hash = `#/p/${encodeURIComponent(c.pid)}/part/${encodeURIComponent(value)}`)}>Edit this part…</Button> : null;
  if (tiles && items.every((i) => i.preview)) {
    return <><TileGrid label={label} value={value} onChange={set} tiles={opts.map((o) => ({ value: o.value, label: o.label, preview: o.value ? <img src={thumb(c.pid, o.value, c.family)} alt="" width={64} height={64} loading="lazy" /> : <span className="fr-faint">—</span> }))} />{editLink}</>;
  }
  return <><RadioList label={label} items={opts} value={value} onChange={set} />{editLink}</>;
}

/** Sliders and options from control assets of one kind (Catalog A3b, A4b, A9b). */
function Controls({ c, kind, only }: { c: PropsContext; kind: string; only: 'slider' | 'enum' | 'color' | 'all' }) {
  const items = useKind(kind, c.pid);
  if (!items) return null;
  const out: ReactNode[] = [];
  for (const it of items) {
    const ctl = (c.manifest(it.ref)?.data as { control?: { type: string; default?: unknown; endLabels?: [string, string]; options?: string[]; presets?: string[]; range?: [number, number] } } | undefined)?.control;
    if (!ctl || (only !== 'all' && ctl.type !== only)) continue;
    const cur = c.draft.data.controls[it.ref];
    if (ctl.type === 'slider') {
      const def = typeof ctl.default === 'number' ? ctl.default : 50;
      out.push(<SliderRow key={it.ref} label={it.name} value={typeof cur === 'number' ? cur : def} defaultValue={def} min={ctl.range?.[0] ?? 0} max={ctl.range?.[1] ?? 100} {...(ctl.endLabels ? { endLabels: ctl.endLabels } : {})} onChange={(v, phase) => c.edit((d) => { if (v === def) delete d.data.controls[it.ref]; else d.data.controls[it.ref] = v; }, phase)} />);
    } else if (ctl.type === 'enum' && ctl.options?.length) {
      const v = typeof cur === 'string' ? cur : String(ctl.default ?? ctl.options[0]);
      out.push(<div key={it.ref} className="st-field-row"><span className="fr-label">{it.name}</span><Segmented label={it.name} value={v} onChange={(x) => c.edit((d) => { d.data.controls[it.ref] = x; })} options={ctl.options.map((o) => ({ value: o, label: o[0]!.toUpperCase() + o.slice(1) }))} /></div>);
    } else if (ctl.type === 'color') {
      const v = typeof cur === 'string' ? cur : String(ctl.default ?? '#000000');
      out.push(<div key={it.ref} className="st-field-col"><span className="fr-label">{it.name} <span className="fr-faint fr-mono">{v.toUpperCase()}</span></span><SwatchGrid label={it.name} value={v} swatches={(ctl.presets ?? []).map((p) => ({ value: p, label: it.name }))} onChange={(x, phase) => c.edit((d) => { d.data.controls[it.ref] = x; }, phase)} /></div>);
    }
  }
  if (!out.length) return null;
  return <>{out}</>;
}

function BodySliders({ c, rows }: { c: PropsContext; rows: [string, string, [string, string]][] }) {
  const body = c.draft.data.body as Record<string, number | undefined>;
  const base = (c.manifest(c.draft.data.bodyBase)?.data as { bodyParams?: Record<string, number> } | undefined)?.bodyParams ?? {};
  return <>{rows.map(([key, label, ends]) => {
    const def = base[key] ?? BODY_DEFAULTS[key] ?? 50;
    return <SliderRow key={key} label={label} endLabels={ends} value={body[key] ?? def} defaultValue={def} onChange={(v, phase) => c.edit((d) => { (d.data.body as Record<string, number>)[key] = v; if (v === def) delete (d.data.body as Record<string, number>)[key]; }, phase)} />;
  })}</>;
}

function SkinTones({ c }: { c: PropsContext }) {
  const items = useKind('skin', c.pid);
  const swatches = (items ?? []).map((i) => ({ value: ((c.manifest(i.ref)?.data as { skinTone?: { base: string } } | undefined)?.skinTone?.base ?? '#000000').toUpperCase(), label: i.name })).filter((s) => s.value !== '#000000');
  return <SwatchGrid label="Skin tone" value={(c.draft.data.colors.skin ?? '#000000').toUpperCase()} swatches={swatches} onChange={(v, phase) => c.edit((d) => { d.data.colors.skin = v; }, phase)} />;
}

function Details({ c }: { c: PropsContext }) {
  const a = useKind('skin-detail', c.pid);
  const b = useKind('makeup', c.pid);
  if (!a || !b) return null;
  const items = [...a, ...b];
  if (!items.length) return <Note>The library has no skin details or makeup yet; characters that list them show the gap in the rig check below.</Note>;
  const on = new Set(c.draft.data.details ?? []);
  return <>{items.map((i) => <ToggleRow key={i.ref} label={i.name} checked={on.has(i.ref)} onChange={(v) => c.edit((d) => { const s = new Set(d.data.details ?? []); if (v) s.add(i.ref); else s.delete(i.ref); d.data.details = [...s]; })} />)}</>;
}

function Garments({ c, kind, label }: { c: PropsContext; kind: string; label: string }) {
  const items = useKind(kind, c.pid);
  const look = c.look;
  if (!look) return <Note>Create a look first.</Note>;
  if (!items) return null;
  const kindOf = (ref: string) => c.manifest(ref)?.kind ?? ref.slice(0, ref.indexOf('.'));
  const current = look.garments.find((g) => kindOf(g) === kind) ?? '';
  const set = (v: string) => c.edit((d) => {
    const l = d.data.looks.find((x) => x.id === look.id)!;
    l.garments = l.garments.filter((g) => kindOf(g) !== kind);
    if (v) l.garments.push(v);
  });
  const slot = (c.manifest(current)?.data as { colorSlot?: string } | undefined)?.colorSlot ?? kind;
  const colour = look.colors[slot] ?? (c.manifest(current)?.data as { colors?: Record<string, string> } | undefined)?.colors?.[slot];
  // Per-garment options (FR-WRD-02): sleeves rolled, hood up, jacket open… stored per look.
  const opts = (c.manifest(current)?.data as { options?: Record<string, string[]> } | undefined)?.options ?? {};
  const setOpt = (k: string, v: string) => c.edit((d) => {
    const l = d.data.looks.find((x) => x.id === look.id)!;
    l.options = { ...(l.options ?? {}), [current]: { ...(l.options?.[current] ?? {}), [k]: v } };
  });
  return (
    <>
      {items.length ? <RadioList label={label} value={current} onChange={set} items={[{ value: '', label: 'None' }, ...items.map((i) => ({ value: i.ref, label: i.name, ...(i.group ? { meta: i.group } : {}) }))]} /> : <Note>The library has no {label.toLowerCase()} yet.</Note>}
      {current && Object.entries(opts).map(([k, values]) => (
        <Segmented key={k} label={`${label}: ${OPTION_LABELS[k] ?? k}`} value={look.options?.[current]?.[k] ?? values[0]!} onChange={(v) => setOpt(k, v)} options={values.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} />
      ))}
      {current && (c.manifest(current)?.data as { patternable?: boolean } | undefined)?.patternable && <PatternPicker c={c} garment={current} label={label} />}
      {current && <div className="st-field-col"><span className="fr-label">Colour {colour && <span className="fr-faint fr-mono">{colour.toUpperCase()}</span>}</span><SwatchGrid label={`${label} colour`} value={(colour ?? '#808080').toUpperCase()} swatches={GARMENT_SWATCHES} onChange={(v, phase) => c.edit((d) => { d.data.looks.find((x) => x.id === look.id)!.colors[slot] = v; }, phase)} /></div>}
    </>
  );
}

/** Fabric pattern for one garment in the look (Catalog B6, FR-WRD-02): pattern, scale, rotation and its colours. */
function PatternPicker({ c, garment, label }: { c: PropsContext; garment: string; label: string }) {
  const patterns = useKind('pattern', c.pid);
  const look = c.look!;
  const cur = look.patterns?.[garment];
  const pdata = cur ? (c.manifest(cur.pattern)?.data as { pattern?: { defaults: { colors: Record<string, string> }; layers: { color: string }[] } } | undefined)?.pattern : undefined;
  const slots = pdata ? [...new Set(pdata.layers.map((l) => l.color))].sort() : [];
  const set = (next: Partial<NonNullable<typeof cur>> | null, phase?: EditPhase) => c.edit((d) => {
    const l = d.data.looks.find((x) => x.id === look.id)!;
    const all = { ...(l.patterns ?? {}) };
    if (next === null) delete all[garment];
    else all[garment] = { ...(all[garment] ?? { pattern: '' }), ...next } as NonNullable<typeof cur>;
    l.patterns = all;
  }, phase);
  if (!patterns?.length) return null;
  return (
    <div className="st-field-col">
      <Select label={`${label} pattern`} value={cur?.pattern ?? ''} onChange={(v) => set(v ? { pattern: v } : null)} options={[{ value: '', label: 'Plain' }, ...patterns.filter((p) => !p.tags?.includes('plain') && !p.tags?.includes('image')).map((p) => ({ value: p.ref, label: p.name }))]} />
      {cur && <>
        <SliderRow label="Pattern scale" value={cur.scale ?? 1} min={0.4} max={3} step={0.1} defaultValue={1} format={(v) => `${v.toFixed(1)}×`} onChange={(v, phase) => set({ scale: v }, phase)} />
        <SliderRow label="Pattern rotation" value={cur.rotation ?? 0} min={-90} max={90} step={5} defaultValue={0} format={(v) => `${Math.round(v)}°`} onChange={(v, phase) => set({ rotation: v }, phase)} />
        {slots.map((slot, i) => (
          <div key={slot} className="st-field-col"><span className="fr-label">Pattern colour {i + 1}</span>
            <SwatchGrid label={`Pattern colour ${i + 1}`} value={(cur.colors?.[i] ?? pdata!.defaults.colors[slot] ?? '#FFFFFF').toUpperCase()} swatches={GARMENT_SWATCHES} onChange={(v, phase) => {
              const colors = slots.map((s2, j) => cur.colors?.[j] ?? pdata!.defaults.colors[s2] ?? '#FFFFFF');
              colors[i] = v;
              set({ colors }, phase);
            }} />
          </div>
        ))}
      </>}
    </div>
  );
}

const OPTION_LABELS: Record<string, string> = { sleeves: 'Sleeves', hood: 'Hood', front: 'Front', pattern: 'Pattern' };

/** Neutral garment palette offered as presets; any colour is possible with the custom swatch. */
const GARMENT_SWATCHES = ['#2B2D33', '#3F5F8F', '#4F8F87', '#3E5953', '#7B5EA8', '#A33F55', '#C8653F', '#D9A441', '#EFE7DA', '#7F8A96'].map((v) => ({ value: v, label: 'Colour' }));

function Looks({ c }: { c: PropsContext }) {
  const looks = c.draft.data.looks;
  const look = c.look;
  const [name, setName] = useState(look?.name ?? '');
  useEffect(() => setName(look?.name ?? ''), [look?.id, look?.name]);
  const add = (from?: LookData) => {
    const n = from ? `${from.name} copy` : 'New look';
    let id = '';
    c.edit((d) => {
      id = newLookId(d.data.looks, n);
      d.data.looks.push(from ? { ...JSON.parse(JSON.stringify(from)) as LookData, id, name: n } : { id, name: n, garments: [], accessories: [], colors: {} });
    });
    c.setLook(id);
  };
  return (
    <>
      <RadioList label="Looks" value={look?.id} onChange={c.setLook} items={looks.map((l) => ({ value: l.id, label: l.name, meta: `${l.id === c.draft.data.defaultLook ? 'Default · ' : ''}${l.garments.length} item${l.garments.length === 1 ? '' : 's'}` }))} />
      <div className="st-buttons">
        <Button onClick={() => add()}>New look</Button>
        <Button onClick={() => look && add(look)} disabled={!look} disabledReason="Choose a look">Duplicate</Button>
        <Button onClick={() => look && c.edit((d) => { d.data.defaultLook = look.id; })} disabled={!look || look.id === c.draft.data.defaultLook} disabledReason={look ? 'Already the default look' : 'Choose a look'}>Set as default</Button>
        <Button
          onClick={() => {
            if (!look) return;
            const rest = looks.filter((l) => l.id !== look.id);
            c.edit((d) => {
              d.data.looks = d.data.looks.filter((l) => l.id !== look.id);
              if (d.data.defaultLook === look.id) d.data.defaultLook = rest[0]!.id;
            });
            c.setLook(rest[0]!.id);
          }}
          disabled={!look || looks.length < 2}
          disabledReason={looks.length < 2 ? 'A character keeps at least one look' : 'Choose a look'}
        >Delete</Button>
      </div>
      {look && <TextField label="Look name" value={name} onChange={setName} onBlur={() => name.trim() && name !== look.name && c.edit((d) => { d.data.looks.find((l) => l.id === look.id)!.name = name.trim(); })} />}
      <Note>A look is a named outfit. Scenes choose a look; the character stays the same person (FR-CHR-09).</Note>
    </>
  );
}

function Voice({ c }: { c: PropsContext }) {
  const items = useKind('voice', c.pid);
  const v = c.draft.data.voice;
  const m = v ? c.manifest(v) : undefined;
  const data = m?.data as { description?: string; method?: string; language?: string; references?: { emotion: string; media: { hash: string }; transcript: string; fixture: boolean }[] } | undefined;
  const [playing, setPlaying] = useState<string>();
  const [audio] = useState(() => (typeof Audio !== 'undefined' ? new Audio() : undefined));
  useEffect(() => () => audio?.pause(), [audio]);
  const play = (hash: string) => {
    if (!audio) return;
    if (playing === hash) {
      audio.pause();
      setPlaying(undefined);
      return;
    }
    audio.src = api.mediaUrl(c.pid, hash);
    audio.onended = () => setPlaying(undefined);
    void audio.play().then(() => setPlaying(hash)).catch(() => setPlaying(undefined));
  };
  return (
    <>
      {items && items.length > 0 ? <RadioList label="Voice asset" value={v ?? ''} onChange={(x) => c.edit((d) => { d.data.voice = x; })} items={items.map((i) => ({ value: i.ref, label: i.name, meta: i.ref.split('@')[1] ? `v${i.ref.split('@')[1]}` : '' }))} /> : items ? <Note>No voices yet. Design one from the workspace (Voice designer).</Note> : null}
      {m && (
        <>
          <KV k="Method" v={data?.method === 'design' ? 'Designed from a description' : data?.method === 'clone' ? 'Cloned (with consent)' : data?.method ?? '—'} />
          <KV k="Language" v={data?.language ?? '—'} />
          {data?.description && <KV k="Description" v={data.description} />}
          <span className="fr-label">Emotional range</span>
          <div className="st-takes" role="list" aria-label="Emotional range references">
            {(data?.references ?? []).map((r) => (
              <div key={r.emotion + r.media.hash} role="listitem" className="st-take">
                <IconButton label={`${playing === r.media.hash ? 'Stop' : 'Play'} ${r.emotion}`} icon={playing === r.media.hash ? <Square size={14} /> : <Play size={14} />} onClick={() => play(r.media.hash)} />
                <span>{r.emotion[0]!.toUpperCase() + r.emotion.slice(1)}</span>
                {r.fixture && <StatusBadge tone="warning">Fixture · not real speech</StatusBadge>}
              </div>
            ))}
          </div>
        </>
      )}
      {!v && items?.length ? <Note>No voice assigned; lines for this character use the voice chosen per scene.</Note> : null}
    </>
  );
}

function Performance({ c }: { c: PropsContext }) {
  const acts = useKind('act', c.pid);
  const p = c.draft.data.performance;
  const sig = new Set(p.signatureActions);
  return (
    <>
      <Sec k="perf.defaults" title="Defaults" c={c}>
        <SliderRow label="Idle energy" endLabels={['Still', 'Fidgety']} value={p.idleEnergy} defaultValue={50} onChange={(v, phase) => c.edit((d) => { d.data.performance.idleEnergy = v; }, phase)} />
        <SliderRow label="Gesture size" endLabels={['Small', 'Expansive']} value={p.gestureSize} defaultValue={50} onChange={(v, phase) => c.edit((d) => { d.data.performance.gestureSize = v; }, phase)} />
        <SliderRow label="Expression strength" endLabels={['Subtle', 'Cartoonish']} value={p.expressionStrength} defaultValue={60} onChange={(v, phase) => c.edit((d) => { d.data.performance.expressionStrength = v; }, phase)} />
      </Sec>
      <Sec k="perf.signature" title="Signature actions" summary={String(sig.size)} c={c}>
        <div className="st-chips" role="group" aria-label="Signature actions">
          {(acts ?? []).map((a) => <Chip key={a.ref} selected={sig.has(a.ref)} onClick={() => c.edit((d) => { const s = new Set(d.data.performance.signatureActions); if (s.has(a.ref)) s.delete(a.ref); else s.add(a.ref); d.data.performance.signatureActions = [...s]; })}>{a.name}</Chip>)}
        </div>
        <Note>Idles and talking gestures prefer these actions; every generated clip stays editable on the timeline.</Note>
      </Sec>
    </>
  );
}

/** The sections for one tree node (FR-BLD-02). */
export function BuilderProperties({ node, c }: { node: string; c: PropsContext }) {
  const d = c.draft.data as CharacterData;
  switch (node) {
    case 'identity':
      return (
        <>
          <Sec k="id.details" title="Details" c={c}>
            <TextField label="Name" value={c.draft.name} onChange={(v) => c.edit((x) => { x.name = v; }, 'preview')} onBlur={() => c.edit(() => undefined)} />
            <TextField label="Role in the story" value={d.role ?? ''} onChange={(v) => c.edit((x) => { x.data.role = v; }, 'preview')} onBlur={() => c.edit(() => undefined)} />
            <TextArea label="Notes" value={d.notes ?? ''} onChange={(v) => c.edit((x) => { x.data.notes = v; }, 'preview')} />
          </Sec>
          <Sec k="id.describe" title="Start from a description" c={c}>
            <Button disabled disabledReason="Needs a configured language model (Settings → Assistance); none is configured, so describe the character with the sections below">Describe a character…</Button>
          </Sec>
          {c.randomise && (
            <Sec k="id.random" title="Randomise" c={c}>
              <ToggleRow label="Keep life stage" checked={c.randomise.keep.lifeStage} onChange={(v) => c.randomise!.setKeep({ ...c.randomise!.keep, lifeStage: v })} />
              <ToggleRow label="Keep build" checked={c.randomise.keep.body} onChange={(v) => c.randomise!.setKeep({ ...c.randomise!.keep, body: v })} />
              <ToggleRow label="Keep colours" description="Skin and hair colour" checked={c.randomise.keep.palette} onChange={(v) => c.randomise!.setKeep({ ...c.randomise!.keep, palette: v })} />
              <ToggleRow label={`Only parts drawn for ${c.family === 'illustrated' ? 'Illustrated' : 'Flat'}`} checked={c.randomise.keep.family} onChange={(v) => c.randomise!.setKeep({ ...c.randomise!.keep, family: v })} />
              <Button icon={<Shuffle size={14} />} onClick={c.randomise.run}>Randomise</Button>
              <Note>Varies parts and whatever is not kept; name, looks and voice stay. Undo restores the previous character.</Note>
            </Sec>
          )}
          <Sec k="id.stage" title="Life stage" summary={c.manifest(d.lifeStage)?.name} c={c}>
            <LifeStage c={c} />
            <Note>Life stage sets head-to-body proportions; fine-tune them under Body.</Note>
          </Sec>
          <Sec k="id.versions" title="Versions" summary={c.versionInfo.current} c={c}>
            <KV k="Editing" v={c.versionInfo.current} />
            <KV k="Used in" v={c.versionInfo.usedIn} />
            <Note>{c.versionInfo.library ? 'This is a library character. Saving creates a new character of your own; the library version never changes.' : `Saving creates ${c.versionInfo.next}. Scenes using the current version keep it until you update them.`}</Note>
          </Sec>
        </>
      );
    case 'body':
    case 'body.base':
      return <Sec k="body.base" title="Build" summary={c.manifest(d.bodyBase)?.name} c={c}><BodyBase c={c} /></Sec>;
    case 'body.torso':
      return <Sec k="body.torso" title="Upper body, waist and hips" c={c}><BodySliders c={c} rows={TORSO} /></Sec>;
    case 'body.arms':
      return (
        <>
          <Sec k="body.arms" title="Arms" c={c}><BodySliders c={c} rows={ARMS} /></Sec>
          <Sec k="body.hands" title="Hands" summary={c.manifest(d.parts.hands ?? '')?.name} c={c}><KV k="Hand set" v={c.manifest(d.parts.hands ?? '')?.name ?? '—'} /><Note>The hand set draws every hand pose (Catalog A15) in all views.</Note></Sec>
        </>
      );
    case 'body.legs':
      return (
        <>
          <Sec k="body.legs" title="Legs" c={c}><BodySliders c={c} rows={LEGS} /></Sec>
          <Sec k="body.feet" title="Feet" summary={c.manifest(d.parts.feet ?? '')?.name} c={c}><PartPicker c={c} kind="feet" partKey="feet" label="Feet" /></Sec>
        </>
      );
    case 'head':
    case 'head.shape':
      return (
        <>
          <Sec k="head.shape" title="Face shape" summary={c.manifest(d.parts.head ?? '')?.name} c={c}><PartPicker c={c} kind="head" partKey="head" label="Face shape" tiles /></Sec>
          <Sec k="head.struct" title="Facial structure" c={c}><Controls c={c} kind="face-ctl" only="all" /></Sec>
        </>
      );
    case 'head.eyes':
      return (
        <>
          <Sec k="head.eyes" title="Eye shape" summary={c.manifest(d.parts.eyes ?? '')?.name} c={c}><PartPicker c={c} kind="eyes" partKey="eyes" label="Eyes" tiles /></Sec>
          <Sec k="head.eyectl" title="Size, spacing and colour" c={c}><Controls c={c} kind="eye-ctl" only="all" /></Sec>
        </>
      );
    case 'head.brows':
      return <Sec k="head.brows" title="Eyebrows" summary={c.manifest(d.parts.brows ?? '')?.name} c={c}><PartPicker c={c} kind="brow" partKey="brows" label="Eyebrows" tiles /></Sec>;
    case 'head.nose':
      return <Sec k="head.nose" title="Nose" summary={c.manifest(d.parts.nose ?? '')?.name} c={c}><PartPicker c={c} kind="nose" partKey="nose" label="Nose" tiles /></Sec>;
    case 'head.mouth':
      return (
        <>
          <Sec k="head.mouth" title="Mouth" summary={c.manifest(d.parts.mouth ?? '')?.name} c={c}><PartPicker c={c} kind="mouth" partKey="mouth" label="Mouth" tiles /></Sec>
          <Sec k="head.visemes" title="Speech shapes" summary="9 shapes" c={c}><Note>Every mouth draws all nine speech shapes in each view, so lip sync works with any choice. Use “Test lip sync” below the preview.</Note></Sec>
        </>
      );
    case 'head.ears':
      return <Sec k="head.ears" title="Ears" summary={c.manifest(d.parts.ears ?? '')?.name} c={c}><PartPicker c={c} kind="ears" partKey="ears" label="Ears" tiles /></Sec>;
    case 'head.skin':
      return (
        <>
          <Sec k="head.skin" title="Skin tone" summary={(d.colors.skin ?? '').toUpperCase()} c={c}><SkinTones c={c} /></Sec>
          <Sec k="head.details" title="Details and makeup" c={c}><Details c={c} /></Sec>
        </>
      );
    case 'hair':
    case 'hair.style':
      return (
        <>
          <Sec k="hair.style" title="Hairstyle" summary={c.manifest(d.parts.hair ?? '')?.name} c={c}><PartPicker c={c} kind="hair" partKey="hair" label="Hairstyle" tiles /></Sec>
          <Sec k="hair.fringe" title="Fringe" summary={c.manifest(d.parts.fringe ?? '')?.name ?? 'None'} c={c}><PartPicker c={c} kind="fringe" partKey="fringe" label="Fringe" optional /></Sec>
          <Sec k="hair.shape" title="Shape and texture" c={c}><Controls c={c} kind="hair-ctl" only="slider" /><Controls c={c} kind="hair-ctl" only="enum" /></Sec>
        </>
      );
    case 'hair.colour':
      return <Sec k="hair.colour" title="Hair colour" c={c}><Controls c={c} kind="hair-ctl" only="color" /></Sec>;
    case 'hair.facial':
      return <Sec k="hair.facial" title="Facial hair" summary={c.manifest(d.parts.facialHair ?? '')?.name ?? 'None'} c={c}><PartPicker c={c} kind="facial-hair" partKey="facialHair" label="Facial hair" optional /></Sec>;
    case 'wardrobe':
    case 'wardrobe.looks':
      return <Sec k="wardrobe.looks" title="Saved looks" summary={c.look?.name} c={c}><Looks c={c} /></Sec>;
    case 'accessories':
      return <Sec k="acc" title={`Worn items${c.look ? ` · ${c.look.name}` : ''}`} c={c}><Accessories c={c} /></Sec>;
    case 'voice':
    case 'voice.asset':
      return <Sec k="voice.asset" title="Voice asset" summary={d.voice ? c.manifest(d.voice)?.name : 'None'} c={c}><Voice c={c} /></Sec>;
    case 'performance':
      return <Performance c={c} />;
    default: {
      const g = GARMENT_SLOTS.find(([k]) => node === `wardrobe.${k}`);
      if (g) return <Sec k={node} title={`${g[1]}${c.look ? ` · ${c.look.name}` : ''}`} c={c}><Garments c={c} kind={g[0]} label={g[1]} /></Sec>;
      return <EmptyState title="Choose a part">Select a part on the left.</EmptyState>;
    }
  }
}

function LifeStage({ c }: { c: PropsContext }) {
  const items = useKind('stage', c.pid);
  if (!items) return null;
  return <RadioList label="Life stage" value={c.draft.data.lifeStage} onChange={(v) => c.edit((d) => { d.data.lifeStage = v; })} items={items.map((i) => ({ value: i.ref, label: i.name }))} />;
}

function BodyBase({ c }: { c: PropsContext }) {
  const items = useKind('body', c.pid);
  if (!items) return null;
  // Choosing a build resets the fine-tuning sliders to that build's values.
  return <RadioList label="Build" value={c.draft.data.bodyBase} onChange={(v) => c.edit((d) => { d.data.bodyBase = v; d.data.body = {}; })} items={items.map((i) => ({ value: i.ref, label: i.name }))} />;
}

function Accessories({ c }: { c: PropsContext }) {
  const items = useKind('acc', c.pid);
  const look = c.look;
  if (!items) return null;
  if (!look) return <Note>Create a look first.</Note>;
  if (!items.length) return <Note>The library has no accessories yet (Catalog C1); worn items will appear here.</Note>;
  const on = new Set(look.accessories);
  return <>{items.map((i) => <ToggleRow key={i.ref} label={i.name} {...(i.group ? { description: i.group } : {})} checked={on.has(i.ref)} onChange={(v) => c.edit((d) => { const l = d.data.looks.find((x) => x.id === look.id)!; const s = new Set(l.accessories); if (v) s.add(i.ref); else s.delete(i.ref); l.accessories = [...s]; })} />)}</>;
}
