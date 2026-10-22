/** Platform-neutral CPU raster renderer: Node (CLI/export) and the browser (Studio preview) share it, so pixels match (FR-RND-01, NFR-03). */
import type { CanvasKit } from 'canvaskit-wasm';
import { Rasterizer, type FontSource, type ImageResolver } from './raster.js';
import type { Frame } from './displaylist.js';

export interface Renderer {
  ck: CanvasKit;
  raster: Rasterizer;
  /** Renders to unpremultiplied sRGB RGBA bytes. */
  rgba(frame: Frame): Uint8Array;
  png(frame: Frame): Uint8Array;
  decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array };
  dispose(): void;
}

export function createRenderer(ck: CanvasKit, fonts: FontSource[], images?: ImageResolver): Renderer {
  const raster = new Rasterizer(ck, fonts, images);
  const info = (w: number, h: number) => ({ width: w, height: h, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
  // One reusable surface and one readback buffer per frame size: video export renders thousands of same-size frames,
  // and allocating 8 MB per frame fragments the WebAssembly heap until readback fails.
  let cached: { w: number; h: number; surface: NonNullable<ReturnType<CanvasKit['MakeSurface']>>; buf: ReturnType<CanvasKit['Malloc']> } | undefined;
  const surfaceFor = (w: number, h: number) => {
    if (cached && cached.w === w && cached.h === h) return cached;
    release();
    const surface = ck.MakeSurface(w, h);
    if (!surface) throw new Error(`Could not create a ${w}×${h} raster surface`);
    cached = { w, h, surface, buf: ck.Malloc(Uint8Array, w * h * 4) };
    return cached;
  };
  const release = () => {
    if (!cached) return;
    cached.surface.delete();
    ck.Free(cached.buf);
    cached = undefined;
  };
  const draw = (frame: Frame) => {
    const c = surfaceFor(frame.width, frame.height);
    const canvas = c.surface.getCanvas();
    const n = canvas.save();
    raster.draw(canvas, frame);
    canvas.restoreToCount(n);
    return c;
  };
  return {
    ck,
    raster,
    rgba: (frame) => {
      const c = draw(frame);
      const out = c.surface.getCanvas().readPixels(0, 0, info(frame.width, frame.height), c.buf, frame.width * 4);
      if (!out) throw new Error(`Reading back a ${frame.width}×${frame.height} frame failed`);
      // Copy out of the WebAssembly heap: the buffer is reused for the next frame.
      return c.buf.toTypedArray().slice() as Uint8Array;
    },
    png: (frame) => {
      const c = draw(frame);
      const img = c.surface.makeImageSnapshot();
      const bytes = img.encodeToBytes();
      img.delete();
      if (!bytes) throw new Error('PNG encoding failed');
      return bytes;
    },
    decodePng: (bytes) => {
      const img = ck.MakeImageFromEncoded(bytes);
      if (!img) throw new Error('Not a decodable image');
      const w = img.width();
      const h = img.height();
      const rgba = img.readPixels(0, 0, info(w, h)) as Uint8Array;
      img.delete();
      return { width: w, height: h, rgba };
    },
    dispose: () => {
      release();
      raster.dispose();
    },
  };
}
