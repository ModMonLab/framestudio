/**
 * Apply a recipe (FR-RCP-01/03, FR-CAM-04): assign each role to a character or prop in the scene (selected objects
 * are suggested first), choose the line a line-anchored recipe goes with, or start at the playhead. The result is
 * ordinary grouped clips; warnings name any step whose asset is not in the library yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatTimecode, type RecipeData } from '@frame/core';
import { Button, Dialog, Select, useToasts } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';

export function RecipeDialog() {
  const { studio } = useCtx();
  const toasts = useToasts();
  const target = useStudio(studio, (s) => s.recipe);
  const pid = useStudio(studio, (s) => s.pid);
  const project = useStudio(studio, (s) => s.project);
  const sceneId = useStudio(studio, (s) => s.scene);
  const time = useStudio(studio, (s) => s.time);
  const selection = useStudio(studio, (s) => s.selection);
  const scene = sceneId ? project?.scenes[sceneId] : undefined;
  const [data, setData] = useState<RecipeData>();
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [line, setLine] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => studio.set({ recipe: undefined });

  useEffect(() => {
    setData(undefined);
    if (!target) return;
    api.manifest(target.ref, pid).then((m) => {
      const d = (m as { data: { recipe: RecipeData } }).data.recipe;
      setData(d);
      // Suggest roles from the selection first, then the scene's characters and props in order.
      const picked: Record<string, string> = {};
      const sel = selection.filter((x) => x.kind === 'instance').map((x) => x.id);
      for (const r of d.roles) {
        const pool = [...sel, ...(scene?.instances ?? []).map((i) => i.id)].filter((id) => !Object.values(picked).includes(id));
        const hit = pool.find((id) => scene?.instances.find((i) => i.id === id)?.kind === r.kind);
        if (hit) picked[r.key] = hit;
      }
      setRoles(picked);
    }).catch((e: Error) => toasts.show({ tone: 'error', message: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.ref, pid]);

  const lines = useMemo(() => {
    if (!data?.anchor || !scene) return [];
    const who = roles[data.anchor.role];
    return scene.clips.filter((c) => c.line && c.line.speaker === who).sort((a, b) => a.start - b.start);
  }, [data, scene, roles]);
  useEffect(() => {
    // Default to the line at (or after) the playhead.
    setLine(lines.find((c) => c.end > time)?.id ?? lines[0]?.id);
  }, [lines, time]);

  const missing = data?.roles.filter((r) => !r.optional && !roles[r.key]) ?? [];
  const apply = async () => {
    if (!target || !scene || !data) return;
    setBusy(true);
    try {
      const r = await api.applyRecipe(pid, scene.id, { ref: target.ref, roles, ...(data.anchor ? { line } : { at: time }) });
      toasts.show({ tone: r.warnings.length ? 'warning' : 'success', message: `${target.name}: ${r.clips} clips added as one group${r.warnings.length ? `. ${r.warnings.join(' ')}` : ''}` });
      close();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={target ? `Apply ${target.name}` : 'Apply recipe'} open={!!target} onClose={close} footer={<>
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void apply()} disabled={!data || missing.length > 0 || (!!data.anchor && !line)} disabledReason={missing.length ? `Assign ${missing.map((r) => r.label).join(', ')}` : 'Choose the line'}>Apply</Button>
    </>}>
      {!data ? <p className="fr-faint">Loading…</p> : (
        <div className="st-form st-form--flush">
          {data.roles.map((r) => (
            <Select key={r.key} label={r.label} placeholder={`Choose a ${r.kind}`} value={roles[r.key]} onChange={(v) => setRoles((x) => ({ ...x, [r.key]: v }))}
              options={(scene?.instances ?? []).filter((i) => i.kind === r.kind).map((i) => ({ value: i.id, label: i.name }))} />
          ))}
          {data.anchor ? (
            <Select label="Line" placeholder="Choose a line" value={line} onChange={setLine} options={lines.map((c) => ({ value: c.id, label: `${formatTimecode(c.start)} — ${c.line!.text.slice(0, 50)}` }))} />
          ) : <p className="fr-hint">Starts at the playhead ({formatTimecode(time)}) and lasts about {data.duration.toFixed(1)} s.</p>}
          <p className="fr-hint">Adds ordinary clips grouped together: move them as one, ungroup, or edit them one by one.</p>
        </div>
      )}
    </Dialog>
  );
}
