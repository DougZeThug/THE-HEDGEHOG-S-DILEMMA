import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
// @ts-expect-error a plain .mjs plugin (development only)
import { memorySave } from './scripts/vite-memory-save.mjs';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [
    memorySave(__dirname),
    // The app shell works offline once loaded; the recordings, music and memory art in public/
    // are big and stay out of the precache (the browser fetches them as it does now).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: { globPatterns: ['**/*.{js,css,html}'], navigateFallback: null },
    }),
    // `npm run analyze` writes test-output/bundle.html.
    process.env.ANALYZE ? visualizer({ filename: 'test-output/bundle.html', gzipSize: true }) : null,
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reportsDirectory: 'test-output/coverage' },
  },
} as any);
