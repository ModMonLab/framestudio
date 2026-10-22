import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { Rasterizer, type FontSource, type ImageResolver } from './raster.js';
import type { Frame } from './displaylist.js';

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

export interface NodeRenderer {
  ck: CanvasKit;
  raster: Rasterizer;
  /** Renders to unpremultiplied sRGB RGBA bytes. */
  rgba(frame: Frame): Uint8Array;
  png(frame: Frame): Uint8Array;
  decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array };
  dispose(): void;
}

export async function createNodeRenderer(opts: { fontsDir: string; images?: ImageResolver }): Promise<NodeRenderer> {
  const ck = await loadCanvasKit();
  const raster = new Rasterizer(ck, loadFonts(opts.fontsDir), opts.images);
  const info = (w: number, h: number) => ({ width: w, height: h, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
  const withSurface = <T>(frame: Frame, fn: (s: ReturnType<CanvasKit['MakeSurface']> & object) => T): T => {
    const surface = ck.MakeSurface(frame.width, frame.height);
    if (!surface) throw new Error('Could not create a raster surface');
    try {
      raster.draw(surface.getCanvas(), frame);
      return fn(surface);
    } finally {
      surface.delete();
    }
  };
  return {
    ck,
    raster,
    rgba: (frame) => withSurface(frame, (s) => s.getCanvas().readPixels(0, 0, info(frame.width, frame.height)) as Uint8Array),
    png: (frame) => withSurface(frame, (s) => {
      const img = s.makeImageSnapshot();
      const bytes = img.encodeToBytes();
      img.delete();
      if (!bytes) throw new Error('PNG encoding failed');
      return bytes;
    }),
    decodePng: (bytes) => {
      const img = ck.MakeImageFromEncoded(bytes);
      if (!img) throw new Error('Not a decodable image');
      const w = img.width();
      const h = img.height();
      const rgba = img.readPixels(0, 0, info(w, h)) as Uint8Array;
      img.delete();
      return { width: w, height: h, rgba };
    },
    dispose: () => raster.dispose(),
  };
}
