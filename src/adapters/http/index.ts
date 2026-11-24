import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { ResultStore } from "./resultStore.js";

const port = Number(process.env.PORT ?? 8787);
const store = new ResultStore();
const app = createApp({ store });

// Periodic cleanup of expired results.
setInterval(() => void store.sweep(), 5 * 60 * 1000).unref();

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`sva api → http://127.0.0.1:${port}/api`);
});
