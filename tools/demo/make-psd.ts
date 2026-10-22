/**
 * Writes a layered PSD test figure (front with all nine mouth shapes, three-quarter with a resting mouth only) for the
 * rigging assistant tests and demos: `tsx tools/demo/make-psd.ts out.psd`.
 */
import fs from 'node:fs';
import { writePsdUint8Array, type Layer } from 'ag-psd';

function rect(name: string, left: number, top: number, w: number, h: number, rgb: [number, number, number], hidden = false): Layer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { name, left, top, right: left + w, bottom: top + h, hidden, imageData: { width: w, height: h, data } };
}

export const MOUTHS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];

export function figure(view: string, mouths: string[]): Layer {
  return {
    name: view,
    children: [
      rect('leg_L', 205, 560, 40, 300, [40, 60, 120]), rect('leg_R', 155, 560, 40, 300, [40, 60, 120]),
      rect('torso', 140, 250, 120, 320, [200, 60, 60]),
      rect('upper_arm_L', 262, 260, 30, 150, [200, 60, 60]), rect('forearm_L', 262, 410, 26, 140, [230, 180, 140]),
      rect('upper_arm_R', 108, 260, 30, 150, [200, 60, 60]), rect('forearm_R', 112, 410, 26, 140, [230, 180, 140]),
      rect('head', 130, 40, 140, 180, [230, 180, 140]),
      rect('eye_L', 215, 110, 16, 16, [20, 20, 20]), rect('eye_R', 169, 110, 16, 16, [20, 20, 20]),
      ...mouths.map((m, i) => rect(`mouth_${m}`, 200 - (10 + i * 4), 170, 2 * (10 + i * 4), 12, [120, 20, 30], m !== 'X')),
    ],
  };
}

export function figurePsd(views: [string, string[]][]): Uint8Array {
  return writePsdUint8Array({ width: 400, height: 900, children: views.map(([v, m]) => figure(v, m)) }, { generateThumbnail: false } as never);
}

if (process.argv[2]) fs.writeFileSync(process.argv[2], figurePsd([['Front', MOUTHS], ['Three-quarter', ['X']]]));
