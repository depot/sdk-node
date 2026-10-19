import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // src/manual-smoke.ts calls the live API; only test/ contains automated tests.
    include: ['test/**/*.test.{js,mjs,ts}'],
    environment: 'node',
    testTimeout: 10_000,
  },
})
