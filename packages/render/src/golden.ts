import fs from 'node:fs';
import path from 'node:path';
import { pixelDiff } from './raster.js';
import type { NodeRenderer } from './node.js';
import type { Frame } from './displaylist.js';

export interface GoldenResult {
  name: string;
  status: 'match' | 'created' | 'updated' | 'mismatch';
  diff: number;
  file: string;
  actualFile?: string;
}

/**
 * Golden-frame comparison (SRS §6, NFR-03, NFR-11). Missing goldens are created locally and fail in CI;
 * UPDATE_GOLDEN=1 rewrites them after review. On mismatch the actual image is written next to the golden.
 */
export function checkGolden(r: NodeRenderer, dir: string, name: string, frame: Frame, maxDiff = 0.005): GoldenResult {
  const file = path.join(dir, `${name}.png`);
  const png = r.png(frame);
  if (!fs.existsSync(file) || process.env.UPDATE_GOLDEN === '1') {
    if (!fs.existsSync(file) && process.env.CI) return { name, status: 'mismatch', diff: 1, file };
    const existed = fs.existsSync(file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, png);
    return { name, status: existed ? 'updated' : 'created', diff: 0, file };
  }
  const expected = r.decodePng(new Uint8Array(fs.readFileSync(file)));
  const actual = r.decodePng(png);
  const diff = expected.width === actual.width && expected.height === actual.height ? pixelDiff(expected.rgba, actual.rgba) : 1;
  if (diff > maxDiff) {
    const actualFile = path.join(dir, `${name}.actual.png`);
    fs.writeFileSync(actualFile, png);
    return { name, status: 'mismatch', diff, file, actualFile };
  }
  return { name, status: 'match', diff, file };
}
