/**
 * Browser preview (FR-RND-01/03): the same evaluation (@frame/core) and the same CPU raster renderer
 * (@frame/render createRenderer) as the CLI and export, so preview pixels equal exported pixels.
 */
import CanvasKitInit from 'canvaskit-wasm/full';
import wasmUrl from 'canvaskit-wasm/bin/full/canvaskit.wasm?url';
import { createRenderer, type Renderer, type FontSource, type Frame } from '@frame/render';
import type { FamilyStyle } from '@frame/rig';
import type { AssetManifest, StyleFamily } from '@frame/schema';
import { api } from './api.js';

let rendererP: Promise<Renderer> | undefined;

/**
 * Media bytes for images in the preview, fetched on demand by hash (content-addressed, so never stale). The
 * renderer asks synchronously; a miss starts the fetch and listeners redraw when it lands.
 */
const media = new Map<string, Uint8Array | null>();
const mediaListeners = new Set<() => void>();
let mediaProject = '';
export function setMediaProject(pid: string) {
  mediaProject = pid;
}
export function onMediaLoaded(fn: () => void) {
  mediaListeners.add(fn);
  return () => mediaListeners.delete(fn);
}
function imageBytes(src: string): Uint8Array | undefined {
  if (!src.startsWith('media:') || !mediaProject) return undefined;
  const hash = src.slice(6);
  if (media.has(hash)) return media.get(hash) ?? undefined;
  media.set(hash, null);
  void fetch(api.mediaUrl(mediaProject, hash))
    .then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null))
    .catch(() => null)
    .then((b) => {
      if (!b) return; // stays null: missing media is reported by validation, not refetched every frame
      media.set(hash, b);
      for (const fn of mediaListeners) fn();
    });
  return undefined;
}

export function getRenderer(): Promise<Renderer> {
  rendererP ??= (async () => {
    const ck = await CanvasKitInit({ locateFile: () => wasmUrl });
    const manifest = (await (await fetch('/content/fonts/fonts.json')).json()) as { fonts: { family: string; file: string }[] };
    const fonts: FontSource[] = await Promise.all(manifest.fonts.map(async (f) => ({ family: f.family, data: new Uint8Array(await (await fetch(`/content/fonts/${f.file}`)).arrayBuffer()) })));
    return createRenderer(ck, fonts, imageBytes);
  })();
  return rendererP;
}

let stylesP: Promise<Record<StyleFamily, FamilyStyle>> | undefined;
export function getStyles() {
  stylesP ??= api.styles() as Promise<Record<StyleFamily, FamilyStyle>>;
  return stylesP;
}

/**
 * Synchronous manifest resolver for evaluation. Scenes prefetch everything they touch; a miss records the ref,
 * fetches it and notifies so the frame is drawn again.
 */
export class AssetCache {
  private map = new Map<string, AssetManifest | null>();
  private pending = new Set<string>();
  private listeners = new Set<() => void>();
  version = 0;

  constructor(private readonly pid: string) {
    setMediaProject(pid);
    onMediaLoaded(() => this.bump());
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  async prefetchScene(scene: string) {
    const r = await api.sceneAssets(this.pid, scene);
    for (const [ref, m] of Object.entries(r.manifests)) this.map.set(ref, m as AssetManifest);
    this.bump();
  }

  manifest = (ref: string): AssetManifest | undefined => {
    const m = this.map.get(ref);
    if (m !== undefined) return m ?? undefined;
    if (!this.pending.has(ref)) {
      this.pending.add(ref);
      api.manifest(ref, this.pid)
        .then((x) => this.map.set(ref, x as AssetManifest))
        .catch(() => this.map.set(ref, null))
        .finally(() => {
          this.pending.delete(ref);
          this.bump();
        });
    }
    return undefined;
  };

  /** True when the server reported the ref as not found. */
  isMissing(ref: string): boolean {
    return this.map.get(ref) === null;
  }

  get loading(): boolean {
    return this.pending.size > 0;
  }
}

/** Draws a frame into a visible canvas through the CPU raster path. */
export function blit(r: Renderer, frame: Frame, canvas: HTMLCanvasElement) {
  const rgba = r.rgba(frame);
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const data = new Uint8ClampedArray(rgba.byteLength);
  data.set(rgba);
  ctx.putImageData(new ImageData(data, frame.width, frame.height), 0, 0);
}
