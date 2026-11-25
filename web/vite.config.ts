import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootPkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
    alias: {
      "@contract": path.resolve(import.meta.dirname, "../src/adapters/http/contract.ts"),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // One copy of React / TanStack Query even for lazily-loaded dev chunks (Devtools),
  // otherwise a late-optimized dep can get its own context ("No QueryClient set").
  optimizeDeps: { include: ["@tanstack/react-query", "@tanstack/react-query-devtools"] },
  server: {
    // API (Hono) runs on :8787 — see ../src/adapters/http
    // API port is configurable so e2e tests can run beside a dev server.
    proxy: { "/api": `http://127.0.0.1:${process.env.SVA_API_PORT ?? 8787}` },
  },
});
