/**
 * Voice library (FR-VOI-01): every voice the project can use (this project's, your library's and Frame's) with name,
 * description, method, language, versions, usage, and a play button for each reference; design, clone and assign.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mic, Play, Sparkles } from 'lucide-react';
import type { VoiceData } from '@frame/schema';
import { AppBar, Breadcrumb, Button, EmptyState, IconButton, Panel, SearchField, Select, StatusBadge, VSep, useToasts } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { CloneDialog } from './CloneDialog.js';
import { useCtx } from './Workspace.js';

interface VoiceRow { ref: string; name: string; source?: string }
type Manifest = { id: string; version: number; name: string; data: VoiceData; provenance?: { method: string; date: string } };

const METHOD: Record<string, string> = { design: 'Designed', clone: 'Cloned', preset: 'Starter', recorded: 'Recorded' };

export function VoiceLibrary() {
  const { studio, openVoiceDesigner } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project)!;
  const [rows, setRows] = useState<VoiceRow[]>();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string>();
  const [m, setM] = useState<Manifest>();
  const [versions, setVersions] = useState<number[]>([]);
  const [cloning, setCloning] = useState(false);
  const [assignTo, setAssignTo] = useState<string>();
  const revision = useStudio(studio, (s) => s.revision);
  useEffect(() => {
    api.library('', 'voice', pid, 500).then((r) => setRows(r.results.map((h) => ({ ref: h.ref, name: h.name, ...(h.source ? { source: h.source } : {}) })))).catch(() => setRows([]));
  }, [pid, revision]);
  useEffect(() => {
    if (!picked) return;
    let live = true;
    api.manifest(picked, pid).then((x) => live && setM(x as Manifest)).catch(() => setM(undefined));
    fetch(`/api/library/details?ref=${encodeURIComponent(picked)}&project=${encodeURIComponent(pid)}`).then((r) => r.json()).then((d: { versions?: { version: number }[] }) => live && setVersions((d.versions ?? []).map((v) => v.version))).catch(() => setVersions([]));
    return () => {
      live = false;
    };
  }, [picked, pid]);
  // Characters using each voice, across scenes.
  const users = useMemo(() => {
    const out = new Map<string, { scene: string; instance: string; name: string }[]>();
    for (const sc of Object.values(project.scenes)) for (const i of sc.instances) {
      const v = i.character?.voice;
      if (v) out.set(v.split('@')[0]!, [...(out.get(v.split('@')[0]!) ?? []), { scene: sc.id, instance: i.id, name: `${i.name} · ${sc.name}` }]);
    }
    return out;
  }, [project]);
  const characters = Object.values(project.scenes).flatMap((sc) => sc.instances.filter((i) => i.kind === 'character').map((i) => ({ value: `${sc.id}/${i.id}`, label: `${i.name} · ${sc.name}` })));
  const shown = (rows ?? []).filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const back = () => (location.hash = `#/p/${encodeURIComponent(pid)}`);
  const play = (hash: string) => void new Audio(api.mediaUrl(pid, hash)).play().catch(() => toasts.show({ tone: 'error', message: 'This reference could not be played.' }));
  const assign = async () => {
    if (!picked || !assignTo) return;
    const [scene, id] = assignTo.split('/') as [string, string];
    const inst = project.scenes[scene]?.instances.find((i) => i.id === id);
    if (!inst?.character) return;
    await studio.exec([{ name: 'instance.update', params: { scene, id, set: { character: { ...inst.character, voice: picked } } } }], `Use ${m?.name ?? 'voice'} for ${inst.name}`);
  };
  const d = m?.data;
  const used = m ? users.get(m.id) ?? [] : [];
  return (
    <div className="fr-root st-app st-builder st-library">
      <AppBar left={<>
        <IconButton label="Back to the workspace" icon={<ArrowLeft size={16} />} onClick={back} />
        <VSep />
        <Breadcrumb items={[{ label: project.project.name, onClick: back }, { label: 'Voices' }]} />
      </>} right={<>
        <Button icon={<Sparkles size={14} />} onClick={() => openVoiceDesigner(undefined)}>Design a voice…</Button>
        <Button icon={<Mic size={14} />} onClick={() => setCloning(true)}>Clone a voice…</Button>
      </>} />
      <div className="st-voices">
        <Panel title="Voices" label="Voices" help="#/help/voice" search={<SearchField label="Search voices" placeholder="Search voices" value={q} onChange={setQ} />}>
          {rows === undefined ? <p className="fr-faint" style={{ padding: 12 }}>Loading…</p> : shown.length === 0 ? <EmptyState title="No voices yet">Design a voice from a description, or clone one from a recording with consent.</EmptyState> : (
            <ul className="st-list" aria-label="Voices">
              {shown.map((r) => <li key={r.ref}><button type="button" className="st-list__row" aria-pressed={picked === r.ref} onClick={() => setPicked(r.ref)}><b>{r.name}</b><span className="fr-faint">{r.source === 'project' ? 'This project' : r.source === 'user' ? 'My library' : r.source === 'bundled' ? 'Frame' : r.source ?? ''} · v{r.ref.split('@')[1]}</span></button></li>)}
            </ul>
          )}
        </Panel>
        <Panel title={m?.name ?? 'Voice'} label="Voice details">
          {!m || !d ? <EmptyState title="Choose a voice">Its references, versions and users show here.</EmptyState> : (
            <div className="st-form">
              <p>{d.description || <span className="fr-faint">No description.</span>}</p>
              <div className="st-row">
                <StatusBadge tone="info">{METHOD[d.method] ?? d.method}</StatusBadge>
                <span className="fr-faint">Language {d.language} · version {m.version}{versions.length > 1 ? ` of ${Math.max(...versions)}` : ''}</span>
                {d.references.some((r) => r.fixture) && <StatusBadge tone="warning">Fixture audio — not real speech</StatusBadge>}
              </div>
              {d.consent && <p className="fr-hint">Consent: {d.consent.statement === 'own-voice' ? 'own voice' : 'documented consent'} of {d.consent.speakerName}, confirmed by {d.consent.confirmedBy} on {d.consent.date}.</p>}
              <span className="fr-label">References</span>
              <ul className="st-list" aria-label="References">
                {d.references.map((r, i) => (
                  <li key={i} className="st-voice-ref">
                    <IconButton size="sm" label={`Play ${r.emotion} reference`} icon={<Play size={13} />} onClick={() => play(r.media.hash)} />
                    <b>{r.emotion}</b>
                    <span className="fr-faint">“{r.transcript}”{r.accepted ? '' : ' · not accepted'}</span>
                  </li>
                ))}
              </ul>
              <span className="fr-label">Used by</span>
              {used.length ? <ul className="st-list">{used.map((u) => <li key={`${u.scene}/${u.instance}`} className="st-voice-ref">{u.name}</li>)}</ul> : <p className="fr-faint">No character uses this voice yet.</p>}
              <div className="st-row">
                <div style={{ flex: 1 }}><Select label="Use for" value={assignTo} placeholder="Choose a character" options={characters} onChange={setAssignTo} /></div>
                <Button disabled={!assignTo} disabledReason="Choose a character" onClick={() => void assign()}>Use voice</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
      {cloning && <CloneDialog onClose={() => setCloning(false)} />}
    </div>
  );
}
