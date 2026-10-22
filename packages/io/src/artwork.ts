/**
 * Layered artwork for the rigging assistant (FR-IMP-03): a PSD (ag-psd) or layered SVG becomes a list of named
 * layers with bounds, grouped by view when the file has view groups ("front", "three-quarter", "side", "back").
 * Raster layers are stored as content-addressed PNG media; vector layers keep their paths.
 */
import { deflateSync } from 'node:zlib';
import { initializeCanvas, readPsd, type Layer as PsdLayer } from 'ag-psd';
import { FrameError, type View } from '@frame/schema';
import { parseSvg, type VectorShape } from './import-image.js';

export interface ArtLayer {
  id: string;
  name: string;
  /** View group the layer belongs to; undefined when the file has no view groups. */
  view?: View;
  /** Other (non-view) group path, for display. */
  group?: string;
  hidden: boolean;
  /** Bounds in artwork units [x, y, w, h]. */
  bounds: [number, number, number, number];
  /** Raster layer: PNG bytes (stored by the caller) and their hash once stored. */
  png?: Uint8Array;
  media?: string;
  /** Vector layer paths (artwork units). */
  paths?: VectorShape[];
}

export interface LayeredArtwork {
  source: 'psd' | 'svg';
  fileName: string;
  width: number;
  height: number;
  views: View[];
  layers: ArtLayer[];
  warnings: string[];
}

const VIEW_NAMES: [RegExp, View][] = [
  [/^(front|frontal)$/i, 'front'],
  [/^(three[\s_-]?quarters?|3\/?4|3q|¾|three)$/i, 'three'],
  [/^(side|profile)$/i, 'side'],
  [/^(back|rear)$/i, 'back'],
];
export function viewOfGroup(name: string): View | undefined {
  const n = name.trim();
  return VIEW_NAMES.find(([re]) => re.test(n))?.[1];
}

/* ------------------------------------------------------------------ PNG encoding */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Encodes 8-bit RGBA pixels as a PNG (deterministic: fixed zlib level, no metadata). */
export function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 6 }))), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

/* ------------------------------------------------------------------ readers */

const MAX_ART_BYTES = 256 * 1024 * 1024;

// ag-psd allocates pixel buffers through a canvas hook; Frame reads raw pixels only, so plain buffers are enough and
// no canvas (or native module) is ever used.
let psdReady = false;
function setupPsd() {
  if (psdReady) return;
  initializeCanvas(
    () => {
      throw new Error('Canvas output is not used by Frame');
    },
    (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData,
  );
  psdReady = true;
}

function readPsdArtwork(bytes: Uint8Array, fileName: string): LayeredArtwork {
  setupPsd();
  let psd;
  try {
    psd = readPsd(bytes, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true, throwForMissingFeatures: false, logMissingFeatures: false } as never);
  } catch (e) {
    throw new FrameError('VALIDATION_FAILED', `${fileName} is not a readable PSD: ${(e as Error).message}`);
  }
  const layers: ArtLayer[] = [];
  const warnings: string[] = [];
  let n = 0;
  const walk = (list: PsdLayer[] | undefined, view: View | undefined, group: string | undefined, depth: number) => {
    for (const l of list ?? []) {
      const name = (l.name ?? `Layer ${n + 1}`).trim();
      if (l.children) {
        const v = depth === 0 ? viewOfGroup(name) : undefined;
        walk(l.children, v ?? view, v ? group : group ? `${group}/${name}` : name, depth + 1);
        continue;
      }
      const img = l.imageData;
      const left = l.left ?? 0;
      const top = l.top ?? 0;
      if (!img || !img.width || !img.height) {
        warnings.push(`Layer "${name}" has no pixels and was skipped`);
        continue;
      }
      n++;
      layers.push({ id: `l${n}`, name, ...(view ? { view } : {}), ...(group ? { group } : {}), hidden: !!l.hidden, bounds: [left, top, img.width, img.height], png: encodePng(img.data as Uint8ClampedArray, img.width, img.height) });
    }
  };
  walk(psd.children, undefined, undefined, 0);
  if (!layers.length) throw new FrameError('VALIDATION_FAILED', `${fileName} has no image layers`, undefined, 'Save the PSD with layers (not flattened).');
  return { source: 'psd', fileName, width: psd.width, height: psd.height, views: [...new Set(layers.map((l) => l.view).filter((v): v is View => !!v))], layers, warnings };
}

function readSvgArtwork(bytes: Uint8Array, fileName: string): LayeredArtwork {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FrameError('VALIDATION_FAILED', `${fileName} is not UTF-8 text, so it is not a valid SVG`);
  }
  const { drawing, warnings } = parseSvg(text, { container: (name) => !!viewOfGroup(name) });
  const layers: ArtLayer[] = drawing.layers.map((l, i) => {
    const view = l.group ? viewOfGroup(l.group) : undefined;
    return { id: `l${i + 1}`, name: l.name, ...(view ? { view } : {}), hidden: false, bounds: l.bounds, paths: l.shapes };
  });
  return { source: 'svg', fileName, width: drawing.width, height: drawing.height, views: [...new Set(layers.map((l) => l.view).filter((v): v is View => !!v))], layers, warnings };
}

/** Reads a layered PSD or SVG. Raster layers carry PNG bytes for the caller to store as media. */
export function readLayeredArtwork(bytes: Uint8Array, fileName: string): LayeredArtwork {
  if (bytes.byteLength > MAX_ART_BYTES) throw new FrameError('VALIDATION_FAILED', `${fileName} is larger than 256 MB`);
  const isPsd = bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53; // "8BPS"
  if (isPsd) return readPsdArtwork(bytes, fileName);
  if (/\.svg$/i.test(fileName) || /^\s*(<\?xml|<svg)/.test(new TextDecoder().decode(bytes.subarray(0, 256)))) return readSvgArtwork(bytes, fileName);
  throw new FrameError('VALIDATION_FAILED', `${fileName} is not a layered PSD or SVG`, undefined, 'The rigging assistant reads layered PSD files and SVG files with named groups.');
}
