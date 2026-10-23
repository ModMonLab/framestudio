/**
 * Record in the browser (FR-VOI-05): input device choice, noise-floor check, count-in, live level meter, numbered
 * recordings, and automatic trim of leading/trailing silence that stays editable. Produces 16-bit mono WAV.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square } from 'lucide-react';
import { Button, Select, SliderRow, StatusBadge, t as tt } from '@frame/ui';

export interface Recording { wav: Uint8Array; durationS: number; number: number; noiseFloorDb: number }

const dbfs = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** First and last sample above `threshold` (linear), padded; the trim the recorder proposes. */
export function autoTrim(data: Float32Array, rate: number, thresholdDb = -40, padS = 0.1): [number, number] {
  const t = Math.pow(10, thresholdDb / 20);
  let a = 0;
  while (a < data.length && Math.abs(data[a]!) < t) a++;
  let b = data.length - 1;
  while (b > a && Math.abs(data[b]!) < t) b--;
  if (a >= data.length) return [0, data.length / rate];
  return [Math.max(0, a / rate - padS), Math.min(data.length / rate, b / rate + padS)];
}

export function encodeWav16(data: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i]!)) * 0x7fff, true);
  return new Uint8Array(buf);
}

type Phase = 'idle' | 'checking' | 'countin' | 'recording' | 'review';

export function Recorder({ onUse, useLabel = 'Use this recording', minSeconds = 0 }: { onUse: (r: Recording) => void; useLabel?: string; minSeconds?: number }) {
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
  const [device, setDevice] = useState<string>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const [level, setLevel] = useState(-Infinity);
  const [noise, setNoise] = useState<number>();
  const [error, setError] = useState<string>();
  const [number, setNumber] = useState(0);
  const [audio, setAudio] = useState<{ data: Float32Array; rate: number }>();
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const live = useRef<{ stream: MediaStream; ctx: AudioContext; rec?: MediaRecorder; raf?: number; chunks: Blob[] } | undefined>(undefined);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((ds) => {
      const ins = ds.filter((d) => d.kind === 'audioinput').map((d, i) => ({ value: d.deviceId || `default-${i}`, label: d.label || `Microphone ${i + 1}` }));
      setDevices(ins);
      setDevice((cur) => cur ?? ins[0]?.value);
    }).catch(() => setDevices([]));
    return () => stopAll();
  }, []);

  const stopAll = () => {
    const l = live.current;
    if (!l) return;
    if (l.raf) cancelAnimationFrame(l.raf);
    l.stream.getTracks().forEach((t) => t.stop());
    void l.ctx.close().catch(() => undefined);
    live.current = undefined;
  };

  const start = async () => {
    setError(undefined);
    setAudio(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(device && !device.startsWith('default-') ? { deviceId: { exact: device } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      live.current = { stream, ctx, chunks: [] };
      const buf = new Float32Array(an.fftSize);
      const peakNow = () => {
        an.getFloatTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v));
        return m;
      };
      // Noise floor: one quiet second before the count-in (FR-VOI-05).
      setPhase('checking');
      let sum = 0, n = 0;
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          for (const v of buf) { sum += v * v; n++; }
          setLevel(dbfs(peakNow()));
          if (performance.now() - t0 < 1000) live.current!.raf = requestAnimationFrame(tick);
          else done();
        };
        tick();
      });
      const floor = Math.round(dbfs(Math.sqrt(sum / Math.max(1, n))) * 10) / 10;
      setNoise(floor);
      // Count-in: 3, 2, 1 with short beeps.
      setPhase('countin');
      for (const c of [3, 2, 1]) {
        setCount(c);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.15;
        osc.frequency.value = c === 1 ? 1320 : 880;
        osc.connect(g).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
        await new Promise((r) => setTimeout(r, 700));
      }
      const rec = new MediaRecorder(stream);
      live.current.rec = rec;
      rec.ondataavailable = (e) => e.data.size && live.current?.chunks.push(e.data);
      rec.start();
      setPhase('recording');
      const meter = () => {
        setLevel(dbfs(peakNow()));
        if (live.current) live.current.raf = requestAnimationFrame(meter);
      };
      meter();
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Microphone access was refused. Allow it in the browser and try again.' : (e as Error).message);
      stopAll();
      setPhase('idle');
    }
  };

  const stop = async () => {
    const l = live.current;
    if (!l?.rec) return;
    const done = new Promise<void>((r) => (l.rec!.onstop = () => r()));
    l.rec.stop();
    await done;
    const blob = new Blob(l.chunks, { type: l.rec.mimeType });
    try {
      const decoded = await l.ctx.decodeAudioData(await blob.arrayBuffer());
      // Mono mixdown.
      const data = new Float32Array(decoded.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) data[i]! += ch[i]! / decoded.numberOfChannels;
      }
      setAudio({ data, rate: decoded.sampleRate });
      setTrim(autoTrim(data, decoded.sampleRate));
      setNumber((x) => x + 1);
      setPhase('review');
    } catch (e) {
      setError(`The recording could not be read: ${(e as Error).message}`);
      setPhase('idle');
    } finally {
      stopAll();
    }
  };

  const trimmed = () => {
    if (!audio) return undefined;
    const a = Math.floor(trim[0] * audio.rate), b = Math.ceil(trim[1] * audio.rate);
    return audio.data.slice(a, Math.max(a + 1, b));
  };
  const preview = () => {
    const d = trimmed();
    if (!d || !audio) return;
    const ctx = new AudioContext();
    const b = ctx.createBuffer(1, d.length, audio.rate);
    b.copyToChannel(d, 0);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.onended = () => void ctx.close();
    s.start();
  };
  const total = audio ? audio.data.length / audio.rate : 0;
  const len = trim[1] - trim[0];

  return (
    <div className="st-recorder">
      <Select label={tt('Microphone')} value={device} placeholder={devices.length ? 'Choose' : 'Default microphone'} options={devices} disabled={phase !== 'idle' && phase !== 'review'} disabledReason={tt('Stop recording first')} onChange={setDevice} />
      <div className="st-rec-meter" role="meter" aria-label={tt('Input level')} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Number.isFinite(level) ? Math.round(level) : -60}>
        <div style={{ width: `${Math.max(0, Math.min(100, ((level + 60) / 60) * 100))}%` }} className={level > -3 ? 'st-rec-hot' : ''} />
      </div>
      <div className="st-row">
        {phase === 'recording'
          ? <Button variant="primary" icon={<Square size={14} />} onClick={() => void stop()}>{tt('Stop')}</Button>
          : <Button variant="primary" icon={<Mic size={14} />} disabled={phase === 'checking' || phase === 'countin'} disabledReason={tt('Getting ready…')} onClick={() => void start()}>{number ? 'Record again' : 'Record'}</Button>}
        {phase === 'checking' && <StatusBadge tone="info">{tt('Checking the room… stay quiet')}</StatusBadge>}
        {phase === 'countin' && <StatusBadge tone="warning">{count}</StatusBadge>}
        {phase === 'recording' && <StatusBadge tone="danger">{tt('Recording')} {number + 1}</StatusBadge>}
        {noise !== undefined && <span className={noise > -45 ? 'fr-error-text' : 'fr-faint'}>{tt('Noise floor')} {noise}  {tt('dBFS')}{noise > -45 ? ' — a quieter room will sound better' : ''}</span>}
      </div>
      {error && <p role="alert" className="fr-error-text">{error}</p>}
      {phase === 'review' && audio && (
        <div className="st-field-col">
          <span className="fr-label">{tt('Recording')} {number} · {total.toFixed(1)}  {tt('s · trimmed to')} {len.toFixed(1)} s</span>
          <SliderRow label={tt('Trim start')} value={trim[0]} min={0} max={total} step={0.01} defaultValue={autoTrim(audio.data, audio.rate)[0]} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => setTrim(([, b]) => [Math.min(v, b - 0.05), b])} />
          <SliderRow label={tt('Trim end')} value={trim[1]} min={0} max={total} step={0.01} defaultValue={autoTrim(audio.data, audio.rate)[1]} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => setTrim(([a]) => [a, Math.max(v, a + 0.05)])} />
          <div className="st-row">
            <Button icon={<Play size={14} />} onClick={preview}>{tt('Play trimmed')}</Button>
            <Button variant="primary" disabled={len < minSeconds} disabledReason={`Needs at least ${minSeconds} s`} onClick={() => { const d = trimmed()!; onUse({ wav: encodeWav16(d, audio.rate), durationS: d.length / audio.rate, number, noiseFloorDb: noise ?? -Infinity }); }}>{useLabel}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
