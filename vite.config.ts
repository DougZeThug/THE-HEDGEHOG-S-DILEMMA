import { defineConfig } from 'vite';
// @ts-expect-error a plain .mjs plugin (development only)
import { memorySave } from './scripts/vite-memory-save.mjs';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [memorySave(__dirname)],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
