import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Manual evidence harness for real-directory measurements. It is deliberately
 * outside `pnpm test` (see `vitest.config.mts`), because the real
 * DawnChat ↔ ZenMind pair is far too large for the automated gate.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.evidence.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000
  }
})
