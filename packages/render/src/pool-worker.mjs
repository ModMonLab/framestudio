// Raster pool worker bootstrap: the renderer is TypeScript, so the worker registers the tsx loader first.
import { register } from 'tsx/esm/api';

register();
await import('./pool-thread.ts');
