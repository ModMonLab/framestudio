import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Studio talks to a Frame Server on FRAME_SERVER (default http://127.0.0.1:4848);
// in production the server serves the built Studio itself.
const target = process.env.FRAME_SERVER ?? 'http://127.0.0.1:4848';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5182,
    strictPort: true,
    proxy: { '/api': { target, ws: true }, '/content': target },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
