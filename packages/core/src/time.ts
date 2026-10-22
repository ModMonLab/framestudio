import { TICKS_PER_SECOND } from '@frame/schema';

export { TICKS_PER_SECOND };

export const secondsToTicks = (s: number): number => Math.round(s * TICKS_PER_SECOND);
export const ticksToSeconds = (t: number): number => t / TICKS_PER_SECOND;
export const ticksPerFrame = (fps: number): number => TICKS_PER_SECOND / fps;

/** Frame index containing tick t (frames are half-open intervals). */
export const tickToFrame = (t: number, fps: number): number => Math.floor(t / ticksPerFrame(fps));
export const frameToTick = (f: number, fps: number): number => Math.round(f * ticksPerFrame(fps));

/** Snaps a tick to the nearest frame boundary. */
export const snapToFrame = (t: number, fps: number): number => frameToTick(Math.round(t / ticksPerFrame(fps)), fps);

/** "00:04.2" style timecode used in the timeline toolbar (Design System §6.2). */
export function formatTimecode(t: number, decimals = 1): string {
  const s = ticksToSeconds(t);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const frac = decimals > 0 ? '.' + Math.floor((rest - whole) * 10 ** decimals).toString().padStart(decimals, '0') : '';
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}${frac}`;
}

/** Parses "1.5", "1.5s", "00:01.5", "36f" (frames) into ticks. */
export function parseTime(input: string, fps: number): number {
  const v = input.trim();
  let m = v.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return secondsToTicks(Number(m[1]) * 60 + Number(m[2]));
  m = v.match(/^(-?\d+)f$/);
  if (m) return frameToTick(Number(m[1]), fps);
  m = v.match(/^(-?\d+(?:\.\d+)?)s?$/);
  if (m) return secondsToTicks(Number(m[1]));
  throw new Error(`Cannot parse time "${input}"`);
}
