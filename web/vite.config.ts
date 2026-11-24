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
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
