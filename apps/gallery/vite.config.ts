import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Serve bundled fonts straight from content/ (single copy).
  publicDir: '../../content',
  server: { port: 5181, strictPort: true },
  preview: { port: 5181, strictPort: true },
});
