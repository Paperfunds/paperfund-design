import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fixtureMiddleware } from './fixtures.mjs';
export default defineConfig({
  plugins: [react(), { name: 'designer-fixtures-only', configureServer: (s) => { s.middlewares.use(fixtureMiddleware); }, configurePreviewServer: (s) => { s.middlewares.use(fixtureMiddleware); } }],
  resolve: { alias: { '@paperfund/shared/browser': path.resolve('packages/shared/src/browser.ts') } },
  // This package never loads the parent's environment or proxies production APIs.
  envDir: path.resolve('.'),
  server: { host: '127.0.0.1', port: 5230, strictPort: true, fs: { allow: [process.cwd()] } },
  preview: { host: '127.0.0.1', port: 5230, strictPort: true },
  test: { root: 'apps/web', environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
});
