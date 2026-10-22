/**
 * Script view (FR-PRJ-04, FR-DLG-01/02): every line in scene order with speaker, text, delivery and take state, edited
 * in place (the same line record the timeline and properties show); import a script (`NAME: line` or Fountain) into
 * the current scene; export as text or Fountain; generate missing takes; clean up unused takes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import { formatTimecode, lineTakeState } from '@frame/core';
import type { Clip, Scene } from '@frame/schema';
import { Button, Dialog, Select, TextArea, useToasts } from '@frame/ui';
import { api, type WorkerStatus } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

const TONE: Record<string, string> = { Ready: 'st-sv-take--ok', Missing: 'st-sv-take--bad', Failed: 'st-sv-take--bad', Outdated: 'st-sv-take--warn', Generating: 'st-sv-take--busy', Queued: 'st-sv-take--busy', Muted: 'st-sv-take--muted' };

export function ScriptView() {
  const { studio } = useCtx();
  const toasts = useToasts();
  const project = useStudio(studio, (s) => s.project)!;
  const pid = useStudio(studio, (s) => s.pid);
  const sceneId = useStudio(studio, (s) => s.scene);
  const [worker, setWorker] = useState<WorkerStatus>();
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    api.worker(pid).then(setWorker).catch(() => undefined);
  }, [pid]);
  const emotions = worker?.capabilities?.engines[0]?.controls.emotion ?? [];
  const scenes = useMemo(() => project.project.episodes.flatMap((e) => project.episodes[e]?.scenes ?? []).map((id) => project.scenes[id]!).filter(Boolean), [project]);
  const lines = (sc: Scene) => sc.clips.filter((c) => c.line).sort((a, b) => a.start - b.start);
  const all = scenes.flatMap((sc) => lines(sc).map((c) => ({ sc, c })));
  const missing = all.filter(({ c }) => ['Missing', 'Outdated', 'Failed'].includes(lineTakeState(project, c)) && !c.line!.muted);
  const chosen = new Set(all.map(({ c }) => c.line!.take).filter(Boolean));
  const unused = Object.values(project.takes).filter((t) => !chosen.has(t.id) && t.status !== 'generating' && t.status !== 'queued');

  const generate = async () => {
    const byScene = new Map<string, string[]>();
    for (const { sc, c } of missing) byScene.set(sc.id, [...(byScene.get(sc.id) ?? []), c.id]);
    try {
      for (const [scene, ids] of byScene) await api.generateTakes(pid, { scene, lines: ids, takes: 1 });
      toasts.show({ tone: 'success', message: `Generating takes for ${missing.length} line${missing.length === 1 ? '' : 's'}.` });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const download = (format: 'text' | 'fountain') => {
    const a = document.createElement('a');
    a.href = `/api/projects/${encodeURIComponent(pid)}/script?format=${format}`;
    a.download = '';
    a.click();
  };

  return (
    <section className="st-timeline st-script" aria-label="Script">
      <div className="st-tl-toolbar" role="toolbar" aria-label="Script">
        <FileText size={15} aria-hidden />
        <b>Script</b>
        <span className="fr-faint">{all.length} lines · {missing.length} need takes</span>
        <span className="fr-spacer" />
        <Button icon={<Upload size={13} />} disabled={!sceneId} disabledReason="Open a scene first" onClick={() => setImporting(true)}>Import script…</Button>
        <Button icon={<Download size={13} />} onClick={() => download('fountain')}>Fountain</Button>
        <Button icon={<Download size={13} />} onClick={() => download('text')}>Text</Button>
        <Button disabled={!missing.length || worker?.state !== 'connected'} disabledReason={!missing.length ? 'Every line has a take' : 'Connect the voice worker'} onClick={() => void generate()}>Generate missing takes</Button>
        <Button disabled={!unused.length} disabledReason="No unused takes" onClick={() => void studio.exec([{ name: 'take.remove', params: { ids: unused.map((t) => t.id) } }], `Clean up ${unused.length} takes`)}>Clean up {unused.length || ''} unused takes</Button>
        <Button onClick={() => studio.set({ scriptView: false })}>Back to timeline</Button>
      </div>
      <div className="st-script-body">
        {all.length === 0 && <p className="fr-hint" style={{ padding: 16 }}>No lines yet. Import a script, or add lines from a character's Audio tab.</p>}
        {scenes.map((sc) => lines(sc).length ? (
          <table key={sc.id} className="st-script-table">
            <caption><button type="button" className="st-link" onClick={() => studio.set({ scene: sc.id, scriptView: false })}>{sc.name}</button></caption>
            <thead><tr><th scope="col">Time</th><th scope="col">Speaker</th><th scope="col">Line</th><th scope="col">Delivery</th><th scope="col">Take</th></tr></thead>
            <tbody>{lines(sc).map((c) => <Row key={c.id} sc={sc} c={c} emotions={emotions} />)}</tbody>
          </table>
        ) : null)}
      </div>
      {importing && sceneId && <ImportDialog scene={sceneId} onClose={() => setImporting(false)} />}
    </section>
  );
}

function Row({ sc, c, emotions }: { sc: Scene; c: Clip; emotions: string[] }) {
  const { studio } = useCtx();
  const project = useStudio(studio, (s) => s.project)!;
  const saved = c.line!.text;
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const state = lineTakeState(project, c);
  const commit = () => {
    const t = text.trim();
    if (t && t !== c.line!.text) void studio.exec([{ name: 'line.setText', params: { scene: sc.id, id: c.id, text: t } }], 'Edit line');
    else setText(c.line!.text);
  };
  const speakers = sc.instances.filter((i) => i.kind === 'character');
  const speakerName = speakers.find((i) => i.id === c.line!.speaker)?.name ?? '?';
  return (
    <tr>
      <td className="fr-mono fr-faint"><button type="button" className="st-link" onClick={() => studio.set({ scene: sc.id, time: c.start, selection: [{ kind: 'clip', id: c.id }], scriptView: false })} aria-label={`Show ${speakerName}'s line at ${formatTimecode(c.start)} in the timeline`}>{formatTimecode(c.start)}</button></td>
      <td><Select label={`Speaker of line at ${formatTimecode(c.start)}`} value={c.line!.speaker} options={speakers.map((i) => ({ value: i.id, label: i.name }))} onChange={(v) => void studio.exec([{ name: 'line.setSpeaker', params: { scene: sc.id, id: c.id, speaker: v } }], 'Change speaker')} /></td>
      <td><input className="fr-input st-script-text" aria-label={`${speakerName}: line text`} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(c.line!.text); (e.target as HTMLInputElement).blur(); } }} /></td>
      <td>{emotions.length ? <Select label={`Delivery of ${speakerName}'s line`} value={c.line!.delivery.emotion ?? 'neutral'} options={emotions.map((e) => ({ value: e, label: e }))} onChange={(v) => void studio.exec([{ name: 'line.setDelivery', params: { scene: sc.id, id: c.id, delivery: { ...c.line!.delivery, emotion: v } } }], 'Change delivery')} /> : <span className="fr-faint">{c.line!.delivery.emotion ?? 'neutral'}</span>}</td>
      <td><span className={`st-sv-take ${TONE[state] ?? ''}`}>{state}</span></td>
    </tr>
  );
}

function ImportDialog({ scene, onClose }: { scene: string; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const name = useStudio(studio, (s) => s.project?.scenes[scene]?.name);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.importScript(pid, scene, text);
      toasts.show({ tone: r.unknown.length ? 'warning' : 'success', message: `Added ${r.lines} line${r.lines === 1 ? '' : 's'} to ${name}${r.unknown.length ? `. No character in the scene is called ${r.unknown.join(', ')}.` : '.'}` });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Import script into ${name}`} open onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!text.trim()} disabledReason="Paste a script" onClick={() => void run()}>Add lines</Button>
    </>}>
      <div className="st-form st-form--flush">
        <TextArea label="Script" value={text} onChange={setText} rows={12} placeholder={'MAYA: Welcome back.\nLEO (excited): Great to be here!'} />
        <p className="fr-hint">One line per speaker as “NAME: line”, or Fountain. Speakers match this scene’s characters by name; lines follow the scene’s last line with estimated lengths until takes exist.</p>
      </div>
    </Dialog>
  );
}
