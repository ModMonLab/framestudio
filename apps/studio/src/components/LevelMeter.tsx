/**
 * Level meter (FR-SND-05): left/right sample peaks of the preview mix with a 1.5 s peak hold and a latching clip
 * warning at 0 dBFS. Loudness (LUFS) is measured on export and shown in the render report.
 */
import { useEffect, useRef, useState } from 'react';
import { meterPeaks } from '../lib/playback.js';
import { t as tt } from '@frame/ui';

const FLOOR = -60;
const pct = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100));

export function LevelMeter({ playing }: { playing: boolean }) {
  const [lv, setLv] = useState<[number, number]>([-Infinity, -Infinity]);
  const [hold, setHold] = useState<[number, number]>([-Infinity, -Infinity]);
  const [clipped, setClipped] = useState(false);
  const held = useRef<{ v: [number, number]; at: [number, number] }>({ v: [-Infinity, -Infinity], at: [0, 0] });
  useEffect(() => {
    if (!playing) {
      setLv([-Infinity, -Infinity]);
      return;
    }
    let raf = 0;
    const tick = () => {
      const p = meterPeaks();
      if (p) {
        const now = performance.now();
        const h = held.current;
        for (const i of [0, 1] as const) if (p[i] >= h.v[i] || now - h.at[i] > 1500) { h.v[i] = p[i]; h.at[i] = now; }
        setLv(p);
        setHold([...h.v]);
        if (p[0] >= -0.1 || p[1] >= -0.1) setClipped(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const fmt = (d: number) => (Number.isFinite(d) ? `${d.toFixed(1)} dBFS` : 'silent');
  return (
    <div className="st-meter" role="meter" aria-label={tt('Output level')} aria-valuemin={FLOOR} aria-valuemax={0} aria-valuenow={Number.isFinite(Math.max(...lv)) ? Math.round(Math.max(...lv)) : FLOOR} aria-valuetext={`Left ${fmt(lv[0])}, right ${fmt(lv[1])}, peak ${fmt(Math.max(...hold))}`} title={`Peak ${fmt(Math.max(...hold))}`}>
      {[0, 1].map((i) => (
        <div key={i} className="st-meter-bar">
          <div className={`st-meter-fill ${lv[i]! > -6 ? 'st-meter-fill--hot' : ''}`} style={{ width: `${pct(lv[i]!)}%` }} />
          {Number.isFinite(hold[i]) && <div className="st-meter-hold" style={{ left: `${pct(hold[i]!)}%` }} />}
        </div>
      ))}
      {clipped && <button type="button" className="st-meter-clip" onClick={() => setClipped(false)} title={tt('The mix reached 0 dBFS; lower a gain. Click to reset.')}>{tt('CLIP')}</button>}
    </div>
  );
}
