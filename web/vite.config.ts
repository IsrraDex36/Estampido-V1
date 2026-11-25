import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@contract": path.resolve(import.meta.dirname, "../src/adapters/http/contract.ts"),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // API (Hono) runs on :8787 — see ../src/adapters/http
    // API port is configurable so e2e tests can run beside a dev server.
    proxy: { "/api": `http://127.0.0.1:${process.env.SVA_API_PORT ?? 8787}` },
  },
});
