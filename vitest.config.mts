import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // src/test.ts is a manual live-API smoke script, not an automated test.
    include: ['test/**/*.test.{js,mjs,ts}'],
    environment: 'node',
    testTimeout: 10_000,
  },
})
