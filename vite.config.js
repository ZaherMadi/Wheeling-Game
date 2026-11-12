import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~580 kB minified; it is already split into its own chunk.
    chunkSizeWarningLimit: 650
  }
});
