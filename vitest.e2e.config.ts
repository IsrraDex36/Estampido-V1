import { defineConfig } from "vitest/config";

/** Browser end-to-end tests: real API + built web app + headless Chrome. */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    globalSetup: ["e2e/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
