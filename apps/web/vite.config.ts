import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `base` controls the public path. GitHub Pages serves from /<repo>/, so the
// deploy workflow sets VITE_BASE_PATH=/doodleandplanner/. Cloudflare Pages and
// local dev use '/'. React Router reads import.meta.env.BASE_URL from this.
const base = process.env.VITE_BASE_PATH ?? '/';

// Build stamp baked into the bundle so the running app can say which commit is
// live (see BuildStamp in WorldCupPage). The commit SHA comes from whichever CI
// built it — Cloudflare Pages sets CF_PAGES_COMMIT_SHA, GitHub Actions sets
// GITHUB_SHA — falling back to 'dev' for a local build.
const commitSha =
  process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.VITE_COMMIT_SHA ?? '';
const appVersion = commitSha ? commitSha.slice(0, 7) : 'dev';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the heavy 3D stack in its own chunk so the entry stays light;
        // it's only pulled in by the lazy Hero3D import on the home page.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});
