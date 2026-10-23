/**
 * Clone a voice (FR-VOI-04): a recording (made here or uploaded; at least 3 s, 10–30 s best), its transcript (or
 * auto-transcription on the worker), and a mandatory consent statement with the speaker's name. The consent is
 * stored in the voice and travels with exported .framevoice files.
 */
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button, Dialog, RadioList, TextArea, TextField, ToggleRow, useToasts, t as tt } from '@frame/ui';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/store.js';
import { Recorder } from './Recorder.js';
import { useCtx } from './Workspace.js';

export function CloneDialog({ scene, instance, onClose }: { scene?: string; instance?: string; onClose: () => void }) {
  const { studio } = useCtx();
  const toasts = useToasts();
  const pid = useStudio(studio, (s) => s.pid);
  const instName = useStudio(studio, (s) => (scene && instance ? s.project?.scenes[scene]?.instances.find((i) => i.id === instance)?.name : undefined));
  const [name, setName] = useState(instName ? `${instName}'s voice` : '');
  const [media, setMedia] = useState<{ hash: string; durationS: number; from: string }>();
  const [transcript, setTranscript] = useState('');
  const [statement, setStatement] = useState<'own-voice' | 'documented-consent'>();
  const [speaker, setSpeaker] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [assign, setAssign] = useState(!!instance);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const store = async (bytes: Uint8Array, ext: string, durationS: number, from: string) => {
    try {
      const m = await api.uploadMedia(pid, bytes, ext);
      setMedia({ hash: m.hash, durationS, from });
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    }
  };
  const fromFile = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let durationS = 0;
    try {
      const ctx = new AudioContext();
      durationS = (await ctx.decodeAudioData(bytes.slice().buffer)).duration;
      void ctx.close();
    } catch {
      /* the server decodes and checks the length too */
    }
    await store(bytes, (f.name.split('.').pop() ?? 'wav').toLowerCase(), durationS, f.name);
  };
  const ready = !!media && !!name.trim() && !!statement && !!speaker.trim() && confirmed;
  const reason = !media ? 'Record or upload the speaker first' : !name.trim() ? 'Name the voice' : !statement || !speaker.trim() || !confirmed ? 'Complete the consent section' : '';
  const clone = async () => {
    if (!media || !statement) return;
    setBusy(true);
    try {
      await api.cloneVoice(pid, { name: name.trim(), media: media.hash, ...(transcript.trim() ? { transcript: transcript.trim() } : {}), consent: { statement, speakerName: speaker.trim() }, ...(assign && scene && instance ? { assignTo: [{ scene, instance }] } : {}) });
      toasts.show({ tone: 'info', message: transcript.trim() ? 'Cloning the voice. Follow it in Jobs.' : 'Transcribing and cloning the voice. Follow it in Jobs.' });
      onClose();
    } catch (e) {
      toasts.show({ tone: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={tt('Clone a voice')} open onClose={onClose} wide footer={<>
      <Button onClick={onClose}>{tt('Cancel')}</Button>
      <Button variant="primary" loading={busy} disabled={!ready} disabledReason={reason} onClick={() => void clone()}>{tt('Clone voice')}</Button>
    </>}>
      <div className="st-form st-form--flush">
        <TextField label={tt('Voice name')} value={name} onChange={setName} />
        <h3 className="st-dialog-h">{tt('1 · The speaker')}</h3>
        <p className="fr-hint">{tt('Record or upload at least 3 seconds of clear speech; 10–30 seconds gives the closest likeness.')}</p>
        <Recorder minSeconds={3} useLabel="Use this recording" onUse={(r) => void store(r.wav, 'wav', r.durationS, `Recording ${r.number}`)} />
        <div className="st-row">
          <Button icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>{tt('Upload a recording…')}</Button>
          {media && <span className="fr-faint">{tt('Using')} {media.from}{media.durationS ? ` · ${media.durationS.toFixed(1)} s` : ''}</span>}
        </div>
        <input ref={fileRef} type="file" accept=".wav,.mp3,.flac,.ogg,.m4a,.webm,audio/*" hidden aria-label={tt('Upload a recording')} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
        <TextArea label={tt('What is said in the recording')} value={transcript} onChange={setTranscript} rows={3} placeholder={tt('Leave empty to transcribe it on the voice worker')} />
        <h3 className="st-dialog-h">{tt('2 · Consent (required)')}</h3>
        <RadioList label={tt('Consent')} value={statement} onChange={(v) => setStatement(v as 'own-voice' | 'documented-consent')} items={[
          { value: 'own-voice', label: 'This is my own voice' },
          { value: 'documented-consent', label: 'I have the speaker’s documented consent to clone their voice' },
        ]} />
        <TextField label={tt('Speaker\'s name')} value={speaker} onChange={setSpeaker} />
        <ToggleRow label={tt('I confirm the statement above is true')} description={tt('It is stored with the voice, with the speaker\'s name and today\'s date.')} checked={confirmed} onChange={setConfirmed} />
        {instance && instName && <ToggleRow label={`Use for ${instName}`} checked={assign} onChange={setAssign} />}
      </div>
    </Dialog>
  );
}
