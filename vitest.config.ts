import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = (pkg: string) => fileURLToPath(new URL(`./web/node_modules/${pkg}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Web aliases, so web-side pure logic and stores are tested here too.
    alias: {
      "@contract": fileURLToPath(new URL("./src/adapters/http/contract.ts", import.meta.url)),
      "@/": fileURLToPath(new URL("./web/src/", import.meta.url)),
      // Hook tests (tests/web): one React (the web's), never a second copy.
      react: web("react"),
      "react-dom": web("react-dom"),
      "@testing-library/react": web("@testing-library/react"),
      "@tanstack/react-query": web("@tanstack/react-query"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
