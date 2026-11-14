import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ../shared/stages.js is imported by both the frontend and the backend.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  // Inline (empty) PostCSS config so Vite does not pick up a config from a parent folder.
  css: { postcss: {} },
});
