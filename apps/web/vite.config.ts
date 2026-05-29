import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `base` controls the public path. GitHub Pages serves from /<repo>/, so the
// deploy workflow sets VITE_BASE_PATH=/doodleandplanner/. Cloudflare Pages and
// local dev use '/'. React Router reads import.meta.env.BASE_URL from this.
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: true },
});
