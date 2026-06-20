import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

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

// Each deploy must ship a *changed* service worker so clients adopt the new
// build instead of a stale cache. sw.js lives in public/ (copied verbatim, never
// transformed), so we stamp the build id into the copied dist/sw.js after build.
// A real commit changes it per deploy; local builds get a timestamp so previews
// still update.
const swBuild = appVersion === 'dev' ? `dev-${Date.now()}` : appVersion;
function stampServiceWorker(): Plugin {
  return {
    name: 'dap-stamp-sw',
    apply: 'build',
    closeBundle() {
      try {
        const swPath = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
        writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__DAP_BUILD__', swBuild));
      } catch {
        /* dist/sw.js absent — ignore */
      }
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), stampServiceWorker()],
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
