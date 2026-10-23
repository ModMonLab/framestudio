import type { CanvasKit, Canvas, Paint as CkPaint, Path as CkPath, TypefaceFontProvider, Image as CkImage, Shader } from 'canvaskit-wasm';
import type { BlendMode, Frame, Item, Mat, Paint, Stroke, TextItem } from './displaylist.js';

export interface FontSource {
  family: string;
  data: Uint8Array;
}

/** Resolves image sources (media hashes, asset textures) to encoded bytes. */
export type ImageResolver = (src: string) => Uint8Array | undefined;

/** Parses #RGB, #RRGGBB, #RRGGBBAA and rgba(); returns CanvasKit Color (Float32Array). */
export function parseColor(ck: CanvasKit, c: string): Float32Array {
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1]!.split('').map((h) => parseInt(h + h, 16));
    return ck.Color(r!, g!, b!, 1);
  }
  m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const n = parseInt(m[1]!, 16);
    const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
    return ck.Color((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1]!.split(',').map((s) => parseFloat(s));
    return ck.Color(p[0]!, p[1]!, p[2]!, p[3] ?? 1);
  }
  if (c === 'transparent') return ck.Color(0, 0, 0, 0);
  throw new Error(`Unsupported colour "${c}"`);
}

const blendModes = (ck: CanvasKit): Record<BlendMode, ReturnType<() => CanvasKit['BlendMode']['SrcOver']>> => ({
  normal: ck.BlendMode.SrcOver, multiply: ck.BlendMode.Multiply, screen: ck.BlendMode.Screen, overlay: ck.BlendMode.Overlay,
  'soft-light': ck.BlendMode.SoftLight, color: ck.BlendMode.Color, luminosity: ck.BlendMode.Luminosity, plus: ck.BlendMode.Plus,
  darken: ck.BlendMode.Darken, lighten: ck.BlendMode.Lighten,
});

/**
 * Rasterises display lists with Skia (CanvasKit). One instance per CanvasKit module; caches parsed paths,
 * decoded images and the font provider. Pure function of the display list (FR-RND-02).
 */
/** Direct access to the surface's premultiplied RGBA pixels, for full-frame blends done without Skia's slow path. */
export interface DirectPixels {
  pixels: () => Uint8Array;
  flush: () => void;
}

export class Rasterizer {
  private direct: DirectPixels | undefined;
  private layers = 0;
  private opaque = false;
  private size: [number, number] = [0, 0];
  private pathCache = new Map<string, CkPath>();
  private shaderCache = new Map<string, Shader>();
  private imageCache = new Map<string, CkImage | null>();
  private fonts: TypefaceFontProvider;
  private families = new Set<string>();
  private blends: ReturnType<typeof blendModes>;

  constructor(readonly ck: CanvasKit, fonts: FontSource[], private readonly images: ImageResolver = () => undefined) {
    this.fonts = ck.TypefaceFontProvider.Make();
    for (const f of fonts) {
      this.fonts.registerFont(f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer, f.family);
      this.families.add(f.family);
    }
    this.blends = blendModes(ck);
  }

  hasFamily(f: string): boolean {
    return this.families.has(f);
  }

  private path(d: string): CkPath {
    let p = this.pathCache.get(d);
    if (!p) {
      p = this.ck.Path.MakeFromSVGString(d) ?? new this.ck.Path();
      if (this.pathCache.size > 20_000) {
        const first = this.pathCache.keys().next().value as string;
        this.pathCache.get(first)?.delete();
        this.pathCache.delete(first);
      }
      this.pathCache.set(d, p);
    }
    return p;
  }

  private image(src: string): CkImage | null {
    if (this.imageCache.has(src)) return this.imageCache.get(src)!;
    const bytes = this.images(src);
    // Sources not available yet (the browser preview fetches media on demand) are asked for again next frame.
    if (!bytes) return null;
    const img = this.ck.MakeImageFromEncoded(bytes);
    this.imageCache.set(src, img);
    return img;
  }

  /** Gradient shaders, cached by their definition (most art draws the same gradients in local space every frame). */
  private shader(p: Paint): Shader | undefined {
    const ck = this.ck;
    if (!('linear' in p) && !('radial' in p)) return undefined;
    const key = JSON.stringify(p);
    let sh = this.shaderCache.get(key);
    if (sh) return sh;
    sh = 'linear' in p
      ? ck.Shader.MakeLinearGradient(p.linear.from, p.linear.to, p.linear.stops.map((s) => parseColor(ck, s.color)), p.linear.stops.map((s) => s.offset), ck.TileMode.Clamp)
      : ck.Shader.MakeRadialGradient(p.radial.center, p.radial.radius, p.radial.stops.map((s) => parseColor(ck, s.color)), p.radial.stops.map((s) => s.offset), ck.TileMode.Clamp);
    if (this.shaderCache.size > 4000) {
      const first = this.shaderCache.keys().next().value as string;
      this.shaderCache.get(first)?.delete();
      this.shaderCache.delete(first);
    }
    this.shaderCache.set(key, sh);
    return sh;
  }

  private makePaint(p: Paint, opacity: number, blend: BlendMode | undefined): { paint: CkPaint; shader?: Shader } {
    const ck = this.ck;
    const paint = new ck.Paint();
    paint.setAntiAlias(true);
    const shader = this.shader(p);
    if (shader) {
      paint.setShader(shader);
      paint.setAlphaf(opacity);
    } else {
      const c = parseColor(ck, (p as { color: string }).color);
      c[3] = c[3]! * opacity;
      paint.setColor(c);
    }
    if (blend && blend !== 'normal') paint.setBlendMode(this.blends[blend]);
    return { paint, shader };
  }

  private fillStroke(canvas: Canvas, draw: (paint: CkPaint) => void, fill: Paint | undefined, stroke: Stroke | undefined, op: number, blend?: BlendMode) {
    const ck = this.ck;
    if (fill) {
      const { paint } = this.makePaint(fill, op, blend);
      paint.setStyle(ck.PaintStyle.Fill);
      draw(paint);
      paint.delete();
    }
    if (stroke && stroke.width > 0) {
      const { paint } = this.makePaint(stroke.paint, op, blend);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeWidth(stroke.width);
      paint.setStrokeJoin(stroke.join === 'miter' ? ck.StrokeJoin.Miter : stroke.join === 'bevel' ? ck.StrokeJoin.Bevel : ck.StrokeJoin.Round);
      paint.setStrokeCap(stroke.cap === 'butt' ? ck.StrokeCap.Butt : stroke.cap === 'square' ? ck.StrokeCap.Square : ck.StrokeCap.Round);
      draw(paint);
      paint.delete();
    }
  }

  draw(canvas: Canvas, frame: Frame, direct?: DirectPixels): void {
    const bg = parseColor(this.ck, frame.background);
    canvas.clear(bg);
    this.direct = direct;
    this.layers = 0;
    this.opaque = bg[3] === 1;
    this.size = [frame.width, frame.height];
    for (const it of frame.items) this.item(canvas, it, 1);
    this.direct = undefined;
  }

  /**
   * Multiply and screen fills over the whole frame (night, dusk and neon lighting) applied straight to the pixels.
   * CanvasKit's CPU raster takes its slow pipeline for every blend mode except normal (~20× the cost of a plain fill);
   * on an opaque frame outside any layer the result is the same formula, so it is computed here instead.
   */
  private fastBlend(canvas: Canvas, it: Item, op: number): boolean {
    if (!this.direct || !this.opaque || this.layers > 0 || it.k !== 'rect' || it.r || it.stroke || !it.fill || !('color' in it.fill)) return false;
    if (it.blend !== 'multiply' && it.blend !== 'screen') return false;
    const m = canvas.getTotalMatrix();
    if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 0 || m[4] !== 1 || m[5] !== 0) return false;
    const clip = canvas.getDeviceClipBounds();
    const size = this.size;
    if (it.x > 0 || it.y > 0 || it.x + it.w < size[0] || it.y + it.h < size[1]) return false;
    if (clip[0]! > 0 || clip[1]! > 0 || clip[2]! < size[0] || clip[3]! < size[1]) return false;
    const c = parseColor(this.ck, it.fill.color);
    const a = c[3]! * op;
    this.direct.flush();
    const px = this.direct.pixels();
    if (it.blend === 'multiply') {
      // d · (a·c + 1 − a) per channel
      const f = [0, 1, 2].map((i) => a * c[i]! + 1 - a);
      for (let i = 0; i < px.length; i += 4) {
        px[i] = Math.round(px[i]! * f[0]!);
        px[i + 1] = Math.round(px[i + 1]! * f[1]!);
        px[i + 2] = Math.round(px[i + 2]! * f[2]!);
      }
    } else {
      // d + s − s·d with s = a·c
      const sc = [0, 1, 2].map((i) => a * c[i]! * 255);
      const k = [0, 1, 2].map((i) => 1 - a * c[i]!);
      for (let i = 0; i < px.length; i += 4) {
        px[i] = Math.round(px[i]! * k[0]! + sc[0]!);
        px[i + 1] = Math.round(px[i + 1]! * k[1]! + sc[1]!);
        px[i + 2] = Math.round(px[i + 2]! * k[2]! + sc[2]!);
      }
    }
    return true;
  }

  private concat(canvas: Canvas, m: Mat) {
    canvas.concat([m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1]);
  }

  private item(canvas: Canvas, it: Item, parentOp: number): void {
    const ck = this.ck;
    const op = (it.op ?? 1) * parentOp;
    if (op <= 0.001) return;
    const saved = canvas.save();
    if (it.tf) this.concat(canvas, it.tf);
    switch (it.k) {
      case 'path': {
        const p = this.path(it.d);
        p.setFillType(it.evenOdd ? ck.FillType.EvenOdd : ck.FillType.Winding);
        this.fillStroke(canvas, (paint) => canvas.drawPath(p, paint), it.fill, it.stroke, op, it.blend);
        break;
      }
      case 'rect': {
        if (this.fastBlend(canvas, it, op)) break;
        const r = ck.LTRBRect(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.r) {
          const rr = ck.RRectXY(r, it.r, it.r);
          this.fillStroke(canvas, (paint) => canvas.drawRRect(rr, paint), it.fill, it.stroke, op, it.blend);
        } else this.fillStroke(canvas, (paint) => canvas.drawRect(r, paint), it.fill, it.stroke, op, it.blend);
        break;
      }
      case 'ellipse': {
        const r = ck.LTRBRect(it.cx - it.rx, it.cy - it.ry, it.cx + it.rx, it.cy + it.ry);
        this.fillStroke(canvas, (paint) => canvas.drawOval(r, paint), it.fill, it.stroke, op, it.blend);
        break;
      }
      case 'image': {
        const img = this.image(it.src);
        if (img) {
          const paint = new ck.Paint();
          paint.setAlphaf(op);
          paint.setAntiAlias(true);
          if (it.blend && it.blend !== 'normal') paint.setBlendMode(this.blends[it.blend]);
          canvas.drawImageRectOptions(img, ck.LTRBRect(0, 0, img.width(), img.height()), ck.LTRBRect(it.x, it.y, it.x + it.w, it.y + it.h), ck.FilterMode.Linear, ck.MipmapMode.Linear, paint);
          paint.delete();
        }
        break;
      }
      case 'text':
        this.text(canvas, it, op);
        break;
      case 'group': {
        const needsLayer = op < 1 || it.blur || it.colorMatrix || (it.blend && it.blend !== 'normal');
        if (it.clip) canvas.clipPath(this.path(it.clip), ck.ClipOp.Intersect, true);
        if (needsLayer) {
          const paint = new ck.Paint();
          paint.setAlphaf(op);
          if (it.blend && it.blend !== 'normal') paint.setBlendMode(this.blends[it.blend]);
          let filter = it.blur ? ck.ImageFilter.MakeBlur(it.blur, it.blur, ck.TileMode.Decal, null) : null;
          if (it.colorMatrix) {
            const cf = ck.ColorFilter.MakeMatrix(it.colorMatrix);
            filter = ck.ImageFilter.MakeColorFilter(cf, filter);
          }
          if (filter) paint.setImageFilter(filter);
          canvas.saveLayer(paint);
          this.layers++;
          for (const c of it.items) this.item(canvas, c, 1);
          this.layers--;
          canvas.restore();
          filter?.delete();
          paint.delete();
        } else for (const c of it.items) this.item(canvas, c, op);
        break;
      }
    }
    canvas.restoreToCount(saved);
  }

  /** Lays out text with the bundled fonts (no system fonts: identical output everywhere). */
  measureText(it: Pick<TextItem, 'text' | 'size' | 'family' | 'weight' | 'italic' | 'maxWidth' | 'lineHeight' | 'letterSpacing'>): { width: number; height: number; lines: number } {
    const para = this.paragraph({ ...it, k: 'text', x: 0, y: 0, color: '#000' }, 1);
    const r = { width: para.getMaxIntrinsicWidth(), height: para.getHeight(), lines: para.getLineMetrics().length };
    para.delete();
    return r;
  }

  private paragraph(it: TextItem, op: number) {
    const ck = this.ck;
    const weight = { value: it.weight ?? 400 } as unknown as ReturnType<() => CanvasKit['FontWeight']['Normal']>;
    const base = {
      color: withAlpha(parseColor(ck, it.color), op),
      fontFamilies: [it.family, 'Inter'],
      fontSize: it.size,
      fontStyle: { weight, slant: it.italic ? ck.FontSlant.Italic : ck.FontSlant.Upright },
      heightMultiplier: it.lineHeight ?? 1.25,
      letterSpacing: it.letterSpacing ?? 0,
      ...(it.shadow ? { shadows: [{ color: parseColor(ck, it.shadow.color), offset: [it.shadow.dx, it.shadow.dy], blurRadius: it.shadow.blur }] } : {}),
    };
    const style = new ck.ParagraphStyle({
      textStyle: base,
      textAlign: it.align === 'center' ? ck.TextAlign.Center : it.align === 'right' ? ck.TextAlign.Right : ck.TextAlign.Left,
    });
    const b = ck.ParagraphBuilder.MakeFromFontProvider(style, this.fonts);
    if (it.spans?.length) {
      for (const s of it.spans) {
        b.pushStyle(new ck.TextStyle({ ...base, color: withAlpha(parseColor(ck, s.color ?? it.color), op), fontSize: it.size * (s.scale ?? 1), fontStyle: { ...base.fontStyle, weight: { value: s.weight ?? it.weight ?? 400 } as never } }));
        b.addText(s.text);
        b.pop();
      }
    } else b.addText(it.text);
    const para = b.build();
    para.layout(it.maxWidth ?? 100_000);
    b.delete();
    return para;
  }

  private text(canvas: Canvas, it: TextItem, op: number) {
    const ck = this.ck;
    const para = this.paragraph(it, op);
    const w = it.maxWidth ?? para.getMaxIntrinsicWidth();
    if (it.maxWidth === undefined) para.layout(Math.ceil(w) + 1);
    const x = it.align === 'center' ? it.x - (it.maxWidth ?? w) / 2 : it.align === 'right' ? it.x - (it.maxWidth ?? w) : it.x;
    const y = it.valign === 'bottom' ? it.y - para.getHeight() : it.y;
    if (it.box) {
      const p = new ck.Paint();
      p.setAntiAlias(true);
      p.setColor(withAlpha(parseColor(ck, it.box.color), op));
      for (const m of para.getLineMetrics()) {
        if (m.width <= 0) continue;
        const r = ck.XYWHRect(x + m.left - it.box.padX, y + m.baseline - m.ascent - it.box.padY, m.width + it.box.padX * 2, m.ascent + m.descent + it.box.padY * 2);
        canvas.drawRRect(ck.RRectXY(r, it.box.radius, it.box.radius), p);
      }
      p.delete();
    }
    if (it.outline && it.outline.width > 0) {
      // Outline by drawing a stroked copy first.
      const style = new ck.ParagraphStyle({ textStyle: {}, textAlign: it.align === 'center' ? ck.TextAlign.Center : it.align === 'right' ? ck.TextAlign.Right : ck.TextAlign.Left });
      const fg = new ck.Paint();
      fg.setStyle(ck.PaintStyle.Stroke);
      fg.setStrokeWidth(it.outline.width * 2);
      fg.setStrokeJoin(ck.StrokeJoin.Round);
      fg.setAntiAlias(true);
      fg.setColor(withAlpha(parseColor(ck, it.outline.color), op));
      const bg = new ck.Paint();
      bg.setColor(ck.Color(0, 0, 0, 0));
      const b = ck.ParagraphBuilder.MakeFromFontProvider(style, this.fonts);
      const ts = (size: number, weight: number) => new ck.TextStyle({ fontFamilies: [it.family, 'Inter'], fontSize: size, fontStyle: { weight: { value: weight } as never, slant: it.italic ? ck.FontSlant.Italic : ck.FontSlant.Upright }, heightMultiplier: it.lineHeight ?? 1.25, letterSpacing: it.letterSpacing ?? 0 });
      // Same per-span size and weight as the fill paragraph so the outline lines up exactly.
      if (it.spans?.length) {
        for (const s of it.spans) {
          b.pushPaintStyle(ts(it.size * (s.scale ?? 1), s.weight ?? it.weight ?? 400), fg, bg);
          b.addText(s.text);
          b.pop();
        }
      } else {
        b.pushPaintStyle(ts(it.size, it.weight ?? 400), fg, bg);
        b.addText(it.text);
      }
      const outline = b.build();
      outline.layout(it.maxWidth ?? Math.ceil(w) + 1);
      canvas.drawParagraph(outline, x, y);
      outline.delete();
      b.delete();
      fg.delete();
      bg.delete();
    }
    canvas.drawParagraph(para, x, y);
    para.delete();
  }

  dispose(): void {
    for (const p of this.pathCache.values()) p.delete();
    for (const sh of this.shaderCache.values()) sh.delete();
    this.shaderCache.clear();
    for (const i of this.imageCache.values()) i?.delete();
    this.pathCache.clear();
    this.imageCache.clear();
    this.fonts.delete();
  }
}

function withAlpha(c: Float32Array, op: number): Float32Array {
  c[3] = c[3]! * op;
  return c;
}

/** Fraction of pixels whose max channel difference exceeds `tolerance` (0–255). Used by golden-frame tests (NFR-03). */
export function pixelDiff(a: Uint8Array, b: Uint8Array, tolerance = 8): number {
  if (a.length !== b.length) return 1;
  let bad = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!), Math.abs(a[i + 3]! - b[i + 3]!));
    if (d > tolerance) bad++;
  }
  return bad / (a.length / 4);
}
