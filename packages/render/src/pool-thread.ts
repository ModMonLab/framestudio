/** One raster pool thread: its own CanvasKit and renderer; rasterises display lists sent by the pool (pool.ts). */
import { parentPort, workerData } from 'node:worker_threads';
import type { Frame } from './displaylist.js';
import { createNodeRenderer } from './node.js';

const images = new Map<string, Uint8Array>();
const renderer = await createNodeRenderer({ fontsDir: (workerData as { fontsDir: string }).fontsDir, images: (src) => images.get(src) });
parentPort!.on('message', (m: { id: number; frame: Frame; images?: [string, Uint8Array][] } | 'close') => {
  if (m === 'close') {
    renderer.dispose();
    process.exit(0);
  }
  for (const [src, bytes] of m.images ?? []) images.set(src, bytes);
  try {
    const rgba = renderer.rgba(m.frame);
    parentPort!.postMessage({ id: m.id, rgba }, [rgba.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort!.postMessage({ id: m.id, error: (e as Error).message });
  }
});
parentPort!.postMessage({ ready: true });
