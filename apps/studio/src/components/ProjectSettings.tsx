/**
 * Project settings (FR-PRJ-05): name, description, style family (refused with a list while any used asset lacks the
 * target family), frame rate (clips re-snap, FR-DAT-04), default output, caption defaults, voice worker endpoint,
 * render folder and agent permissions (FR-AGT-04). Every change is one undoable command.
 */
import { useEffect, useState } from 'react';
import type { AgentPermissions, OutputSettings, StyleFamily } from '@frame/schema';
import { Button, Dialog, Select, TextField, ToggleRow, useToasts, t as tt } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { NotesEditor } from './NotesEditor.js';
import { useCtx } from './Workspace.js';

type Blocker = { ref: string; name: string; families: string[] };

export function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const project = useStudio(studio, (s) => s.project)!.project;
  const pid = useStudio(studio, (s) => s.pid);
  const [name, setName] = useState(project.name);
  const [worker, setWorker] = useState(project.voiceWorkerUrl ?? '');
  const [renderDir, setRenderDir] = useState(project.renderDir ?? '');
  const [outputs, setOutputs] = useState<{ value: string; label: string }[]>([]);
  const [blockers, setBlockers] = useState<{ family: StyleFamily; list: Blocker[] }>();
  useEffect(() => {
    api.library('', 'out', pid, 50).then((r) => setOutputs(r.results.map((h) => ({ value: h.ref, label: h.name })))).catch(() => setOutputs([]));
  }, [pid]);
  const set = (params: Record<string, unknown>, label: string) => studio.exec([{ name: 'project.setSettings', params }], label);
  const setFamily = async (family: StyleFamily) => {
    const r = await (await fetch(`/api/projects/${encodeURIComponent(pid)}/style-check?family=${family}`)).json() as { blockers: Blocker[] };
    if (r.blockers.length) return void setBlockers({ family, list: r.blockers });
    setBlockers(undefined);
    await set({ styleFamily: family }, `Switch style to ${family}`);
  };
  const setOutput = async (ref: string) => {
    const m = await api.manifest(ref, pid) as { data?: { output?: { width?: number; height?: number; aspect?: string } } };
    const o = m.data?.output;
    if (!o?.width || !o.height) return void toasts.show({ tone: 'error', message: 'That preset has no picture size (audio or image-sequence presets are export-only).' });
    const output: OutputSettings = { preset: ref, width: o.width, height: o.height, aspectRatios: [...new Set([o.aspect ?? `${o.width}:${o.height}`, ...project.output.aspectRatios])].slice(0, 4) };
    await set({ output }, 'Change default output');
  };
  const setFps = async (fps: string) => {
    const r = await studio.exec([{ name: 'project.setFrameRate', params: { frameRate: Number(fps) } }], `Change frame rate to ${fps} fps`);
    const moved = (r?.reports[0] as { moved?: unknown[] } | undefined)?.moved?.length ?? 0;
    if (r) toasts.show({ tone: 'success', message: moved ? `${moved} clip${moved === 1 ? '' : 's'} moved to the nearest ${fps} fps frame.` : `Frame rate is ${fps} fps; no clips moved.` });
  };
  const perm = (k: keyof AgentPermissions, v: boolean) => void studio.exec([{ name: 'project.setPermissions', params: { agent: { ...project.permissions.agent, [k]: v } } }], v ? 'Grant agent permission' : 'Revoke agent permission');

  return (
    <Dialog title={tt('Project settings')} open onClose={onClose} wide footer={<Button variant="primary" onClick={onClose}>{tt('Done')}</Button>}>
      <div className="st-form st-form--flush st-settings">
        <fieldset className="st-settings-group"><legend>{tt('General')}</legend>
          <TextField label={tt('Project name')} value={name} onChange={setName} onBlur={() => name.trim() && name !== project.name ? void set({ name: name.trim() }, `Rename project to ${name.trim()}`) : setName(project.name)} />
          <NotesEditor label={tt('Description')} value={project.description} onCommit={(v) => void set({ description: v }, 'Edit project description')} placeholder={tt('What the show is about, for collaborators and the script\'s title page')} />
        </fieldset>
        <fieldset className="st-settings-group"><legend>{tt('Picture')}</legend>
          <Select label={tt('Style family')} value={project.styleFamily} options={[{ value: 'flat', label: 'Flat' }, { value: 'illustrated', label: 'Illustrated' }]} onChange={(v) => void setFamily(v as StyleFamily)} />
          {blockers && (
            <div role="alert" className="st-settings-alert">
              <p><b>{tt('Can\'t switch to')} {blockers.family}.</b>  {tt('These assets in the project have no')} {blockers.family}  {tt('artwork:')}</p>
              <ul>{blockers.list.slice(0, 12).map((b) => <li key={b.ref}>{b.name} <span className="fr-faint fr-mono">{b.ref}</span></li>)}</ul>
              {blockers.list.length > 12 && <p className="fr-faint">{tt('…and')} {blockers.list.length - 12}  {tt('more.')}</p>}
            </div>
          )}
          <Select label={tt('Frame rate')} value={String(project.frameRate)} options={['24', '25', '30'].map((v) => ({ value: v, label: `${v} fps` }))} onChange={(v) => void setFps(v)} />
          <Select label={tt('Default output')} value={project.output.preset} options={outputs.length ? outputs : [{ value: project.output.preset, label: `${project.output.width}×${project.output.height}` }]} onChange={(v) => void setOutput(v)} />
          <p className="fr-hint">{project.output.width}×{project.output.height}  {tt('· previews')} {project.output.aspectRatios.join(', ')}</p>
        </fieldset>
        <fieldset className="st-settings-group"><legend>{tt('Captions')}</legend>
          <ToggleRow label={tt('Captions on by default')} checked={project.captions.enabled} onChange={(v) => void set({ captions: { ...project.captions, enabled: v } }, v ? 'Turn captions on' : 'Turn captions off')} />
          <ToggleRow label={tt('Speaker labels')} checked={project.captions.speakerLabels} onChange={(v) => void set({ captions: { ...project.captions, speakerLabels: v } }, 'Change speaker labels')} />
          <ToggleRow label={tt('Burn captions into the picture')} description={tt('Off: captions export as SRT/VTT only')} checked={project.captions.burnIn} onChange={(v) => void set({ captions: { ...project.captions, burnIn: v } }, 'Change caption burn-in')} />
        </fieldset>
        <fieldset className="st-settings-group"><legend>{tt('Storage and voice')}</legend>
          <TextField label={tt('Voice worker endpoint')} placeholder={tt('Use the app default')} value={worker} onChange={setWorker} onBlur={() => worker !== (project.voiceWorkerUrl ?? '') && void set({ voiceWorkerUrl: worker.trim() }, 'Change voice worker endpoint')} />
          <p className="fr-hint">{tt('Tokens are never stored in the project; set them in app settings.')}</p>
          <TextField label={tt('Render folder')} placeholder={tt('renders/ inside the project')} value={renderDir} onChange={setRenderDir} onBlur={() => renderDir !== (project.renderDir ?? '') && void set({ renderDir: renderDir.trim() }, 'Change render folder')} />
        </fieldset>
        <fieldset className="st-settings-group"><legend>{tt('Agent permissions')}</legend>
          <p className="fr-hint">{tt('What AI agents connected over MCP or the CLI may do without asking. Only a person can change these.')}</p>
          <ToggleRow label={tt('Delete projects')} checked={project.permissions.agent.deleteProjects} onChange={(v) => perm('deleteProjects', v)} />
          <ToggleRow label={tt('Delete voices')} checked={project.permissions.agent.deleteVoices} onChange={(v) => perm('deleteVoices', v)} />
          <ToggleRow label={tt('Clone voices from recordings')} checked={project.permissions.agent.cloneVoices} onChange={(v) => perm('cloneVoices', v)} />
          <ToggleRow label={tt('Expose the voice worker to other machines')} checked={project.permissions.agent.exposeWorker} onChange={(v) => perm('exposeWorker', v)} />
        </fieldset>
      </div>
    </Dialog>
  );
}
