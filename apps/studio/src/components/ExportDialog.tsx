/**
 * Export dialog (FR-RND-04/07/08/09/10): preset; range (scene, episode, loop, between markers, selection); captions,
 * subtitles and stems; custom size, frame rate, quality and loudness; motion blur; more aspect ratios queued as a
 * batch. Validates first (blocking problems with Show links) and runs as jobs.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, NumberField, Section, Segmented, Select, ToggleRow, useToasts, t as tt } from '@frame/ui';
import type { Problem } from '@frame/schema';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

interface Preset { ref: string; name: string }
type Range = 'scene' | 'episode' | 'loop' | 'markers' | 'selection';
const QUALITY: Record<string, { label: string; crf: number }> = { best: { label: 'Best', crf: 16 }, high: { label: 'High', crf: 20 }, standard: { label: 'Standard', crf: 24 }, small: { label: 'Small file', crf: 30 } };

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const project = useStudio(studio, (s) => s.project)!;
  const sceneId = useStudio(studio, (s) => s.scene);
  const selection = useStudio(studio, (s) => s.selection);
  const pid = useStudio(studio, (s) => s.pid);
  const out = project.project.output;
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState<string>(out.preset);
  const [range, setRange] = useState<Range>('scene');
  const [markerA, setMarkerA] = useState<string>();
  const [markerB, setMarkerB] = useState<string>();
  const [captions, setCaptions] = useState(project.project.captions.enabled && project.project.captions.burnIn);
  const [subs, setSubs] = useState(true);
  const [stems, setStems] = useState(false);
  const [custom, setCustom] = useState(false);
  const [size, setSize] = useState({ w: out.width, h: out.height });
  const [fps, setFps] = useState(String(project.project.frameRate));
  const [quality, setQuality] = useState('high');
  const [loudness, setLoudness] = useState('preset');
  const [blur, setBlur] = useState(false);
  const [ratios, setRatios] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem[]>();
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.library('', 'out', pid, 100).then((r) => setPresets(r.results.map((x) => ({ ref: x.ref, name: x.name })))).catch(() => setPresets([]));
    setProblems(undefined);
    api.validate(pid).then((r) => setProblems(r.problems.filter((p) => p.blocksExport && (!p.scene || range === 'episode' || p.scene === sceneId)))).catch(() => setProblems([]));
  }, [open, pid, range, sceneId]);

  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const episode = sceneId ? project.sceneEpisode[sceneId] : undefined;
  const markers = [...(scene?.markers ?? [])].sort((a, b) => a.at - b.at);
  const selClips = scene ? scene.clips.filter((c) => selection.some((x) => x.kind === 'clip' && x.id === c.id)) : [];
  const blocking = (problems ?? []).filter((p) => p.severity === 'error');
  const rangeTicks = (): { from: number; to: number } | undefined => {
    if (!scene) return undefined;
    if (range === 'loop' && scene.loop) return { from: scene.loop.start, to: scene.loop.end };
    if (range === 'selection' && selClips.length) return { from: Math.min(...selClips.map((c) => c.start)), to: Math.max(...selClips.map((c) => c.end)) };
    if (range === 'markers') {
      const a = markers.find((m) => m.id === markerA)?.at, b = markers.find((m) => m.id === markerB)?.at;
      if (a !== undefined && b !== undefined && a !== b) return { from: Math.min(a, b), to: Math.max(a, b) };
    }
    return undefined;
  };
  const rangeInvalid = range === 'loop' ? !scene?.loop : range === 'selection' ? !selClips.length : range === 'markers' ? !rangeTicks() : false;
  const show = (p: Problem) => {
    const patch: Parameters<typeof studio.set>[0] = { ...(p.scene ? { scene: p.scene } : {}) };
    if (p.target?.kind === 'clip') {
      const c = project.scenes[p.scene ?? sceneId ?? '']?.clips.find((x) => x.id === p.target!.id);
      Object.assign(patch, { selection: [{ kind: 'clip', id: p.target.id }], ...(c ? { time: c.start } : {}) });
    } else if (p.target?.kind === 'instance') Object.assign(patch, { selection: [{ kind: 'instance', id: p.target.id }] });
    studio.set(patch);
    onClose();
  };
  const start = async () => {
    setBusy(true);
    try {
      const scenes = range === 'episode' && episode ? project.episodes[episode]!.scenes : sceneId ? [sceneId] : [];
      const r = range === 'episode' || range === 'scene' ? undefined : rangeTicks();
      const body: Record<string, unknown> = {
        scenes, preset, captions, ...(subs ? { subtitles: ['srt', 'vtt'] } : {}), ...(stems ? { stems: true } : {}), ...(r ? { range: r } : {}),
        ...(custom ? { width: size.w, height: size.h } : {}),
        ...(Number(fps) !== project.project.frameRate ? { fps: Number(fps) } : {}),
        quality: { crf: QUALITY[quality]!.crf },
        ...(loudness === 'off' ? { loudness: null } : loudness !== 'preset' ? { loudness: Number(loudness) } : {}),
        ...(blur ? { motionBlur: { samples: 8, shutter: 0.5 } } : {}),
      };
      // Other aspect ratios (FR-RND-10): same settings, framed per ratio at the output height.
      const extra = ratios.map((ar) => {
        const [a, b] = ar.split(':').map(Number) as [number, number];
        const h = custom ? size.h : out.height;
        const w = Math.round((h * a) / b / 2) * 2;
        return { ...body, aspect: ar, width: w, height: h };
      });
      if (extra.length) {
        const res = await api.renderBatch(pid, [body, ...extra]);
        toasts.show({ tone: 'info', message: `${res.jobs.length} exports queued. Follow them in Jobs.` });
      } else {
        await api.render(pid, body);
        toasts.show({ tone: 'info', message: 'Export started. Follow it in Jobs.' });
      }
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const otherRatios = out.aspectRatios.slice(1);
  return (
    <Dialog title={tt('Export')} open={open} onClose={onClose} wide footer={<>
      <Button onClick={onClose}>{tt('Cancel')}</Button>
      <Button variant="primary" loading={busy} disabled={problems === undefined || blocking.length > 0 || rangeInvalid} disabledReason={problems === undefined ? 'Checking the project…' : rangeInvalid ? 'Choose a valid range' : 'Fix the problems listed above first'} onClick={() => void start()}>{ratios.length ? `Export ${ratios.length + 1}` : 'Export'}</Button>
    </>}>
      <div className="st-form">
        <Select label={tt('Preset')} value={preset} options={presets.map((p) => ({ value: p.ref, label: p.name }))} onChange={setPreset} />
        <Select label={tt('Range')} value={range} onChange={(v) => setRange(v as Range)} options={[
          { value: 'scene', label: `Scene · ${scene?.name ?? ''}` },
          { value: 'episode', label: `Episode · ${episode ? project.episodes[episode]?.name : ''}` },
          { value: 'loop', label: 'Loop range (I/O)', disabled: !scene?.loop, disabledReason: 'Set a loop with I and O first' },
          { value: 'markers', label: 'Between markers', disabled: markers.length < 2, disabledReason: 'Add two markers first' },
          { value: 'selection', label: 'Selected clips', disabled: !selClips.length, disabledReason: 'Select clips on the timeline first' },
        ]} />
        {range === 'markers' && <div className="st-grid2">
          <Select label={tt('From marker')} value={markerA} placeholder={tt('Choose')} options={markers.map((m) => ({ value: m.id, label: m.name }))} onChange={setMarkerA} />
          <Select label={tt('To marker')} value={markerB} placeholder={tt('Choose')} options={markers.map((m) => ({ value: m.id, label: m.name }))} onChange={setMarkerB} />
        </div>}
        <ToggleRow label={tt('Burn in captions')} description={tt('Uses the project caption style.')} checked={captions} onChange={setCaptions} />
        <ToggleRow label={tt('Subtitle files')} description={tt('Writes SRT and WebVTT next to the video.')} checked={subs} onChange={setSubs} />
        <ToggleRow label={tt('Audio stems')} description={tt('Dialogue, music, ambience and SFX as separate WAV files.')} checked={stems} onChange={setStems} />
        {otherRatios.length > 0 && <div className="st-field-col"><span className="fr-label">{tt('Also export in')}</span>
          {otherRatios.map((ar) => <ToggleRow key={ar} label={ar} checked={ratios.includes(ar)} onChange={(v) => setRatios((r) => (v ? [...r, ar] : r.filter((x) => x !== ar)))} />)}
        </div>}
        <Section title={tt('More settings')} open={advanced} onToggle={setAdvanced}>
          <ToggleRow label={tt('Custom size')} checked={custom} onChange={setCustom} />
          {custom && <div className="st-grid2">
            <NumberField label={tt('Width')} prefix="W" unit=" px" precision={0} step={2} min={16} max={7680} value={size.w} onChange={(v, ph) => ph === 'commit' && setSize((s) => ({ ...s, w: Math.round(v / 2) * 2 }))} />
            <NumberField label={tt('Height')} prefix="H" unit=" px" precision={0} step={2} min={16} max={4320} value={size.h} onChange={(v, ph) => ph === 'commit' && setSize((s) => ({ ...s, h: Math.round(v / 2) * 2 }))} />
          </div>}
          <Select label={tt('Frame rate')} value={fps} onChange={setFps} options={['24', '25', '30'].map((v) => ({ value: v, label: `${v} fps${Number(v) === project.project.frameRate ? ' (project)' : ''}` }))} />
          <Segmented label={tt('Quality')} value={quality} onChange={setQuality} options={Object.entries(QUALITY).map(([value, q]) => ({ value, label: q.label }))} />
          <Select label={tt('Loudness')} value={loudness} onChange={setLoudness} options={[{ value: 'preset', label: 'From the preset' }, { value: '-14', label: '−14 LUFS (social video)' }, { value: '-16', label: '−16 LUFS (podcast)' }, { value: '-23', label: '−23 LUFS (broadcast)' }, { value: 'off', label: 'Do not normalise' }]} />
          <ToggleRow label={tt('Motion blur')} description={tt('Averages 8 sub-frames per frame; slower to render.')} checked={blur} onChange={setBlur} />
        </Section>
        {problems === undefined ? <p className="fr-faint">{tt('Checking the project…')}</p> : problems.length === 0 ? <p className="fr-hint">{tt('Ready to export.')}</p> : (
          <div role="alert">
            <p className="fr-error-text">{blocking.length ? 'These problems block export:' : 'Warnings:'}</p>
            <ul className="st-problems">{problems.map((p, i) => <li key={i}>{p.message}{(p.target || p.scene) && <> <Button variant="ghost" onClick={() => show(p)}>{tt('Show')}</Button></>}</li>)}</ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
