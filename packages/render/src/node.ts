import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import type { FontSource, ImageResolver } from './raster.js';
import { createRenderer, type Renderer } from './surface.js';

let ckPromise: Promise<CanvasKit> | undefined;

/** Loads the CanvasKit "full" build (paths, Skia paragraph text) from the pinned package (Node). */
export function loadCanvasKit(): Promise<CanvasKit> {
  if (!ckPromise) {
    const require = createRequire(import.meta.url);
    const file = require.resolve('canvaskit-wasm/bin/full/canvaskit.js');
    ckPromise = import(file).then((m) => (m.default as (o: object) => Promise<CanvasKit>)({ locateFile: (f: string) => path.join(path.dirname(file), f) }));
  }
  return ckPromise;
}

export function loadFonts(fontsDir: string): FontSource[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(fontsDir, 'fonts.json'), 'utf8')) as { fonts: { family: string; file: string }[] };
  return manifest.fonts.map((f) => ({ family: f.family, data: new Uint8Array(fs.readFileSync(path.join(fontsDir, f.file))) }));
}

export type NodeRenderer = Renderer;

export async function createNodeRenderer(opts: { fontsDir: string; images?: ImageResolver }): Promise<NodeRenderer> {
  return createRenderer(await loadCanvasKit(), loadFonts(opts.fontsDir), opts.images);
}

export { createRasterPool, poolSize, type RasterPool } from './pool.js';
