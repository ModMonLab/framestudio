/**
 * Production templates (FR-TPL-01..03): start a scene from a template with any characters in its cast roles,
 * recast a character in place (clips, gaze and shots stay; cameras reframe), and save a scene as a template.
 */
import { useEffect, useState } from 'react';
import type { TemplateData } from '@frame/core';
import { Button, Dialog, Select, useToasts } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio, type Studio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

type Option = { value: string; label: string };

export function saveSceneAsTemplate(studio: Studio, notify: (message: string) => void, scope: 'scene' | 'episode' = 'scene') {
  const s = studio.state;
  const scene = s.scene ? s.project?.scenes[s.scene] : undefined;
  if (!scene) return;
  const ep = s.project!.episodes[s.project!.sceneEpisode[scene.id] ?? ''];
  const name = window.prompt(scope === 'episode' ? 'Template name (every scene of this episode)' : 'Template name', scope === 'episode' ? ep?.name ?? s.project!.project.name : scene.name);
  if (!name?.trim()) return;
  api.saveTemplate(s.pid, scene.id, name.trim(), scope)
    .then((r) => notify(`Saved “${name.trim()}” with ${r.roles.length} cast role${r.roles.length === 1 ? '' : 's'}. Find it under Production templates.`))
    .catch((e: Error) => studio.set({ lastError: { message: e.message } }));
}

export function TemplateDialog() {
  const { studio } = useCtx();
  const toasts = useToasts();
  const target = useStudio(studio, (s) => s.template);
  const recast = useStudio(studio, (s) => s.recast);
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project);
  const sceneId = useStudio(studio, (s) => s.scene);
  const [data, setData] = useState<TemplateData>();
  const [cast, setCast] = useState<Record<string, string>>({});
  const [characters, setCharacters] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const open = !!target || !!recast;
  const close = () => studio.set({ template: undefined, recast: undefined });
  const scene = sceneId ? project?.scenes[sceneId] : undefined;
  const recastInst = recast ? scene?.instances.find((i) => i.id === recast.instance) : undefined;

  useEffect(() => {
    if (!open) return;
    api.library('', 'chr', pid, 200).then((r) => setCharacters(r.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setCharacters([]));
  }, [open, pid]);
  useEffect(() => {
    setData(undefined);
    setCast(recastInst?.asset ? { role: recastInst.asset } : {});
    if (!target) return;
    api.manifest(target.ref, pid).then((m) => {
      const d = (m as { data: { template: TemplateData } }).data.template;
      setData(d);
      setCast(Object.fromEntries(d.roles.map((r) => [r.key, r.default])));
    }).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.ref, recast?.instance, pid]);

  const apply = async () => {
    setBusy(true);
    try {
      if (target) {
        const r = await api.applyTemplate(pid, { ref: target.ref, cast });
        studio.set({ scene: r.scene, selection: [], time: 0 });
        toasts.show({ tone: 'success', message: `New scene from ${target.name}. Its suggested script is in the scene notes.` });
      } else if (recast && scene && cast.role) {
        const r = await api.replaceCast(pid, scene.id, { instance: recast.instance, character: cast.role });
        toasts.show({ tone: 'success', message: `Recast ${recastInst?.name ?? 'character'}${r.reframed ? `; ${r.reframed} camera${r.reframed === 1 ? '' : 's'} reframed` : ''}.` });
      }
      close();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const title = target ? `New scene from ${target.name}` : `Replace ${recastInst?.name ?? 'character'}`;
  return (
    <Dialog title={title} open={open} onClose={close} footer={<>
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void apply()} disabled={target ? !data : !cast.role || cast.role === recastInst?.asset} disabledReason={target ? 'Loading the template' : 'Choose a different character'}>{target ? 'Create scene' : 'Replace'}</Button>
    </>}>
      {target && !data ? <p className="fr-faint">Loading…</p> : (
        <div className="st-form st-form--flush">
          {target ? data!.roles.map((r) => (
            <Select key={r.key} label={r.label} value={cast[r.key]} onChange={(v) => setCast((x) => ({ ...x, [r.key]: v }))} options={characters} />
          )) : <Select label="Character" value={cast.role} onChange={(v) => setCast({ role: v })} options={characters} />}
          <p className="fr-hint">{target
            ? `Adds a ${data!.scene.durationS} s scene with its set, cast, cameras, shots, music and titles. Everything stays editable.`
            : 'Keeps every clip, gaze and shot; cameras framed on this character are reframed for the new one.'}</p>
        </div>
      )}
    </Dialog>
  );
}
