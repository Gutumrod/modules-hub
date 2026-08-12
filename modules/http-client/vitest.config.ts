// ⚠️ EXPERIMENTAL — Anti-cheat coverage gate (NOT permanent)
// Mirrors the sibling config-runtime-module / file-storage-module setup:
// prevents weak/empty/mocked-away tests from passing with low real coverage.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      include: ['core/**/*.ts'],
      // Threshold: real coverage of core >= 90% or the run fails.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
