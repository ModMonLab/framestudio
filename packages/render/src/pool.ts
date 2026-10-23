/**
 * Raster pool (NFR-05): rasterises display lists on worker threads, each with its own CanvasKit, so an export renders
 * several frames at once while the main thread evaluates the next ones. Same rasterizer, so the same pixels (NFR-03).
 */
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Frame, Item } from './displaylist.js';
import type { ImageResolver } from './raster.js';

export interface RasterPool {
  readonly size: number;
  /** RGBA pixels of a frame (resolves in any order; callers keep their own order). */
  rgba(frame: Frame): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Threads worth starting on this machine: leave a core for evaluation and one for the encoder. */
export function poolSize(max = 8): number {
  const n = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(0, Math.min(max, n - 2));
}

function imageSources(items: Item[], out: Set<string>) {
  for (const it of items) {
    if (it.k === 'image') out.add(it.src);
    else if (it.k === 'group') imageSources(it.items, out);
  }
}

export async function createRasterPool(o: { fontsDir: string; size?: number; images?: ImageResolver }): Promise<RasterPool> {
  const size = Math.max(1, o.size ?? poolSize());
  const pending = new Map<number, { resolve: (px: Uint8Array) => void; reject: (e: Error) => void; worker: number }>();
  const busy = new Array<number>(size).fill(0);
  const sent = Array.from({ length: size }, () => new Set<string>());
  let next = 0;
  const workers = await Promise.all(Array.from({ length: size }, (_, w) => new Promise<Worker>((resolve, reject) => {
    const worker = new Worker(new URL('./pool-worker.mjs', import.meta.url), { workerData: { fontsDir: o.fontsDir } });
    worker.on('error', (e) => {
      reject(e);
      for (const [id, p] of pending) if (p.worker === w) {
        pending.delete(id);
        p.reject(e);
      }
    });
    worker.on('message', (m: { ready?: true; id?: number; rgba?: Uint8Array; error?: string }) => {
      if (m.ready) return resolve(worker);
      const p = pending.get(m.id!);
      if (!p) return;
      pending.delete(m.id!);
      busy[w]!--;
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.rgba!);
    });
  })));
  return {
    size,
    rgba(frame) {
      // The least busy thread; image bytes are sent to each thread once.
      let w = 0;
      for (let i = 1; i < size; i++) if (busy[i]! < busy[w]!) w = i;
      const srcs = new Set<string>();
      imageSources(frame.items, srcs);
      const images: [string, Uint8Array][] = [];
      for (const s of srcs) {
        if (sent[w]!.has(s)) continue;
        const bytes = o.images?.(s);
        if (bytes) {
          images.push([s, bytes]);
          sent[w]!.add(s);
        }
      }
      const id = next++;
      busy[w]!++;
      return new Promise<Uint8Array>((resolve, reject) => {
        pending.set(id, { resolve, reject, worker: w });
        workers[w]!.postMessage({ id, frame, ...(images.length ? { images } : {}) });
      });
    },
    async close() {
      await Promise.all(workers.map((w) => new Promise<void>((r) => {
        w.once('exit', () => r());
        w.postMessage('close');
      })));
    },
  };
}
