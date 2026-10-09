import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'dist/client', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  server: { host: '0.0.0.0' }
});
