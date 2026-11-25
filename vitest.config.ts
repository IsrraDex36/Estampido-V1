import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Web aliases, so web-side pure logic and stores are tested here too.
    alias: {
      "@contract": fileURLToPath(new URL("./src/adapters/http/contract.ts", import.meta.url)),
      "@/": fileURLToPath(new URL("./web/src/", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
