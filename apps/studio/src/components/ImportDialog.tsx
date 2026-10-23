/**
 * Import a file (SRS §4.4, FR-IMP-01/02): images become objects or backgrounds, audio goes on a music, ambience or
 * SFX track at the playhead, packages add assets. The user states their rights to the file before anything is
 * stored; the statement and licence are recorded with the import.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, RadioList, TextField, useToasts, t as tt } from '@frame/ui';
import { api, ApiError } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { useCtx } from './Workspace.js';
import { RiggingAssistant } from './RiggingAssistant.js';

export const IMPORT_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,.psd,.wav,.mp3,.flac,.ogg,.m4a,.framechar,.frameasset,.framevoice';
const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const AUDIO = ['wav', 'mp3', 'flac', 'ogg', 'm4a'];
const PACKAGE = ['framechar', 'frameasset', 'framevoice'];

export function ImportDialog({ file, onClose, position }: { file: File | undefined; onClose: () => void; position?: { x: number; y: number } }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const sceneId = useStudio(studio, (s) => s.scene);
  const time = useStudio(studio, (s) => s.time);
  const ext = (file?.name.split('.').pop() ?? '').toLowerCase();
  const kind = IMAGE.includes(ext) ? 'image' : AUDIO.includes(ext) ? 'audio' : PACKAGE.includes(ext) ? 'package' : ext === 'psd' ? 'layered' : 'unsupported';
  const [rights, setRights] = useState<'own' | 'licensed' | 'public-domain'>('own');
  const [licence, setLicence] = useState('');
  const [role, setRole] = useState<string>('object');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRole(kind === 'audio' ? 'music' : 'object');
    setLicence('');
    setRights('own');
  }, [file, kind]);

  const [rigging, setRigging] = useState<File>();
  const run = async () => {
    if (!file) return;
    if (kind === 'layered' || role === 'rig') {
      setRigging(file);
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (kind === 'package') {
        let r;
        try {
          r = await api.importPackage(pid, file);
        } catch (e) {
          if (!(e instanceof ApiError) || e.code !== 'CONFLICT' || !window.confirm(`${e.message}\n\nImport them under new IDs instead?`)) throw e;
          r = await api.importPackage(pid, file, { newIds: true });
        }
        toasts.show({ tone: 'success', message: r.added.length ? `Imported ${r.added.length} asset(s)${r.renamed.length ? ` (${r.renamed.length} under new IDs)` : ''}` : 'Everything in the package is already in this project' });
      } else {
        const r = await api.importFile(pid, file, { rights, ...(rights === 'licensed' ? { licence } : {}), ...(sceneId && role !== 'library' ? { scene: sceneId, as: role, ...(kind === 'audio' ? { at: time } : {}), ...(position ? { x: position.x, y: position.y } : {}) } : {}) });
        toasts.show({ tone: r.warnings.length ? 'warning' : 'success', message: `Imported ${file.name}${r.warnings.length ? ` — ${r.warnings.join('; ')}` : ''}` });
        if (r.instance && sceneId) studio.set({ selection: [{ kind: 'instance', id: r.instance }] });
      }
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const needsLicence = kind !== 'package' && kind !== 'layered' && role !== 'rig' && rights === 'licensed' && !licence.trim();
  return (
    <>
    <RiggingAssistant file={rigging} onClose={() => setRigging(undefined)} />
    <Dialog
      title={file ? `Import ${file.name}` : 'Import'}
      open={!!file}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{tt('Cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void run()} disabled={kind === 'unsupported' || needsLicence} disabledReason={kind === 'unsupported' ? 'This file type cannot be imported' : 'Name the licence you hold'}>{kind === 'layered' || role === 'rig' ? 'Open rigging assistant' : 'Import'}</Button></>}
    >
      {kind === 'unsupported' && <p role="alert">.{ext}  {tt('files cannot be imported. Images: PNG, JPEG, WebP, SVG. Layered artwork: PSD, SVG. Audio: WAV, MP3, FLAC, OGG, M4A. Packages: .framechar, .frameasset, .framevoice.')}</p>}
      {kind === 'layered' && <p>{tt('Layered artwork opens in the rigging assistant, which maps its layers to the rig and makes a character, a prop with states or a set.')}</p>}
      {kind === 'package' && <p>{tt('Adds the package’s assets to this project. Existing assets with the same version are kept; different content under the same ID is refused or imported under new IDs.')}</p>}
      {(kind === 'image' || kind === 'audio') && (
        <div className="st-form st-form--flush">
          <RadioList label={tt('Your rights to this file')} value={rights} onChange={setRights} items={[
            { value: 'own', label: 'I made it or own the rights' },
            { value: 'licensed', label: 'I have a licence to use it' },
            { value: 'public-domain', label: 'It is in the public domain' },
          ]} />
          {rights === 'licensed' && <TextField label={tt('Licence')} placeholder={tt('Licence, e.g. CC-BY-4.0 or the seller’s licence name')} value={licence} onChange={setLicence} />}
          <RadioList label={tt('Use it as')} value={role} onChange={setRole} items={kind === 'image'
            ? [{ value: 'object', label: 'An object in the scene' }, { value: 'background', label: 'The scene background', meta: 'Back plane, covers the stage' }, ...(ext === 'svg' ? [{ value: 'rig', label: 'A character, prop or set (rigging assistant)', meta: 'Layered SVG' }] : []), { value: 'library', label: 'Only add to the project’s assets' }]
            : [{ value: 'music', label: 'Music at the playhead' }, { value: 'ambience', label: 'Ambience at the playhead' }, { value: 'sfx', label: 'Sound effect at the playhead' }, { value: 'library', label: 'Only store it in the project' }]} />
          <p className="fr-hint">{tt('Frame records the file name, today’s date and your statement with the import.')}</p>
        </div>
      )}
    </Dialog>
    </>
  );
}
