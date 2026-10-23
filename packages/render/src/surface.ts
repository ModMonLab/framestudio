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
  // The surface draws straight into an 8-bit premultiplied sRGB buffer: CanvasKit's default MakeSurface blends far more
  // slowly on the CPU (a translucent full-frame fill took ~25× longer), which made atmosphere and fades expensive.
  let cached: { w: number; h: number; surface: NonNullable<ReturnType<CanvasKit['MakeRasterDirectSurface']>>; pixels: ReturnType<CanvasKit['Malloc']> } | undefined;
  const surfaceFor = (w: number, h: number) => {
    if (cached && cached.w === w && cached.h === h) return cached;
    release();
    const pixels = ck.Malloc(Uint8Array, w * h * 4);
    const surface = ck.MakeRasterDirectSurface({ width: w, height: h, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Premul, colorSpace: ck.ColorSpace.SRGB }, pixels, w * 4);
    if (!surface) {
      ck.Free(pixels);
      throw new Error(`Could not create a ${w}×${h} raster surface`);
    }
    cached = { w, h, surface, pixels };
    return cached;
  };
  const release = () => {
    if (!cached) return;
    cached.surface.delete();
    ck.Free(cached.pixels);
    cached = undefined;
  };
  const draw = (frame: Frame) => {
    const c = surfaceFor(frame.width, frame.height);
    const canvas = c.surface.getCanvas();
    const n = canvas.save();
    raster.draw(canvas, frame, { flush: () => c.surface.flush(), pixels: () => c.pixels.toTypedArray() as Uint8Array });
    canvas.restoreToCount(n);
    return c;
  };
  return {
    ck,
    raster,
    rgba: (frame) => {
      const c = draw(frame);
      c.surface.flush();
      // Copy the premultiplied pixels out of the WebAssembly heap (the buffer is reused for the next frame) and
      // unpremultiply the translucent ones; opaque pixels, nearly all of a frame, are already final.
      const px = c.pixels.toTypedArray().slice() as Uint8Array;
      for (let i = 3; i < px.length; i += 4) {
        const a = px[i]!;
        if (a === 255 || a === 0) continue;
        const k = 255 / a;
        px[i - 3] = Math.min(255, Math.round(px[i - 3]! * k));
        px[i - 2] = Math.min(255, Math.round(px[i - 2]! * k));
        px[i - 1] = Math.min(255, Math.round(px[i - 1]! * k));
      }
      return px;
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
