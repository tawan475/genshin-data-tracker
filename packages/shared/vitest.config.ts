import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The storage round-trips encode and decode every section kind through
    // every compression: about 2 s here, past the 5 s default on a slow CI runner.
    testTimeout: 20_000,
  },
})
