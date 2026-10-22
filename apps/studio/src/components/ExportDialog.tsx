/** Export dialog (FR-RND-04/07/08): preset, range, captions, subtitles; validates first and runs as a job. */
import { useEffect, useState } from 'react';
import { Button, Dialog, Select, ToggleRow, useToasts } from '@frame/ui';
import type { Problem } from '@frame/schema';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Preset {
  ref: string;
  name: string;
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const pid = useStudio(studio, (s) => s.pid);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState<string>(project.project.output.preset);
  const [range, setRange] = useState<'scene' | 'episode'>('scene');
  const [captions, setCaptions] = useState(project.project.captions.enabled && project.project.captions.burnIn);
  const [subs, setSubs] = useState(true);
  const [problems, setProblems] = useState<Problem[]>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.library('', 'out', pid, 100).then((r) => setPresets(r.results.map((x) => ({ ref: x.ref, name: x.name })))).catch(() => setPresets([]));
    setProblems(undefined);
    api.validate(pid).then((r) => setProblems(r.problems.filter((p) => p.blocksExport && (!p.scene || range === 'episode' || p.scene === sceneId)))).catch(() => setProblems([]));
  }, [open, pid, range, sceneId]);

  const episode = sceneId ? project.sceneEpisode[sceneId] : undefined;
  const blocking = (problems ?? []).filter((p) => p.severity === 'error');
  const start = async () => {
    setBusy(true);
    try {
      const scenes = range === 'episode' && episode ? project.episodes[episode]!.scenes : sceneId ? [sceneId] : [];
      await api.render(pid, { scenes, preset, captions, ...(subs ? { subtitles: ['srt', 'vtt'] } : {}) });
      toasts.show({ tone: 'info', message: 'Export started. Follow it in Jobs.' });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Export" open={open} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={problems === undefined || blocking.length > 0} disabledReason={problems === undefined ? 'Checking the project…' : 'Fix the problems listed above first'} onClick={() => void start()}>Export</Button>
    </>}>
      <div className="st-form">
        <Select label="Preset" value={preset} options={presets.map((p) => ({ value: p.ref, label: p.name }))} onChange={setPreset} />
        <Select label="Range" value={range} options={[{ value: 'scene', label: `Scene · ${sceneId ? project.scenes[sceneId]?.name : ''}` }, { value: 'episode', label: `Episode · ${episode ? project.episodes[episode]?.name : ''}` }]} onChange={setRange} />
        <ToggleRow label="Burn in captions" description="Uses the project caption style." checked={captions} onChange={setCaptions} />
        <ToggleRow label="Subtitle files" description="Writes SRT and WebVTT next to the video." checked={subs} onChange={setSubs} />
        {problems === undefined ? <p className="fr-faint">Checking the project…</p> : problems.length === 0 ? <p className="fr-hint">Ready to export.</p> : (
          <div role="alert">
            <p className="fr-error-text">{blocking.length ? 'These problems block export:' : 'Warnings:'}</p>
            <ul className="st-problems">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
