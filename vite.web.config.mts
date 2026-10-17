import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * Browser build of the renderer shell. It shares the same sources and aliases as
 * the electron-vite renderer target, but emits a static bundle served without
 * any Electron runtime (renderer falls back to the in-memory PlatformPort).
 */
export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@core': resolve(root, 'src/core'),
      '@renderer': resolve(root, 'src/renderer/src')
    }
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(root, 'dist/web'),
    emptyOutDir: true
  }
})
