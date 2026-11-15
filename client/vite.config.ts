import { defineConfig } from 'vite';

const SERVER = process.env.SPACEBOUND_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
