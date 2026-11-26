import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { communityRoot } from "../../config/paths.js";
import { createApp } from "./app.js";
import { CommunityRepo } from "./community/repo.js";
import { ResultStore } from "./resultStore.js";
import { createServerApp, parseLimits } from "./server.js";

/**
 * API entry.
 * - dev (default): API only on 127.0.0.1:8787 (Vite serves the web and proxies /api)
 * - production (SVA_MODE=production): ONE port serving web/dist + /api, per-IP
 *   limits, security headers, «publish needs a linked WhatsApp». Bound to
 *   127.0.0.1 (SVA_HOST=0.0.0.0 in containers): the public entry is a
 *   tunnel/reverse proxy (SVA_TRUST_PROXY).
 */
const production = process.env.SVA_MODE === "production";
const flag = (v: string | undefined, def: boolean) => (v === undefined ? def : /^(1|true|yes|si|sí)$/i.test(v));

const port = Number(process.env.PORT ?? 8787);
const store = new ResultStore();
const maxMb = Number(process.env.SVA_COMMUNITY_MAX_MB ?? (production ? 2048 : 0)) || Number.POSITIVE_INFINITY;
const community = new CommunityRepo(communityRoot(), Date.now, maxMb * 1024 * 1024);
// Open (and migrate) the community database now, so a problem shows at boot.
const stats = await community.stats();
console.log(`Comunidad (SQLite): ${stats.stickers} stickers, ${stats.sounds} sonidos · ${community.dbPath}`);
const api = createApp({
  store,
  community,
  publishRequiresLink: flag(process.env.SVA_PUBLISH_REQUIRES_LINK, production),
  // Local dev: send to your own chat without linking. Off in production (public).
  ownerSelfSend: flag(process.env.SVA_OWNER_SELF_SEND, !production),
  // /admin: link the bot from the browser (QR / code). Off unless a long secret is set.
  adminToken: process.env.SVA_ADMIN_TOKEN,
});

let fetch = api.fetch;
if (production) {
  const webDist = resolve(process.env.SVA_WEB_DIST ?? "web/dist");
  if (!existsSync(resolve(webDist, "index.html"))) {
    console.error(`Falta la web compilada en ${webDist}. Ejecuta: npm run build:web`);
    process.exit(1);
  }
  const { limits, ignored } = parseLimits(process.env.SVA_LIMITS);
  if (ignored.length) console.warn(`SVA_LIMITS: ignoro ${ignored.join(", ")} (formato: nombre=N/10m)`);
  if (limits && Object.keys(limits).length) console.log(`Límites personalizados: ${Object.keys(limits).join(", ")}`);
  fetch = createServerApp({
    api,
    webDist,
    trustProxy: flag(process.env.SVA_TRUST_PROXY, true),
    limits,
    publicUrl: process.env.SVA_PUBLIC_URL,
    googleVerification: process.env.SVA_GOOGLE_SITE_VERIFICATION,
  }).fetch;
}

// Periodic cleanup of expired results.
setInterval(() => void store.sweep(), 5 * 60 * 1000).unref();

// 127.0.0.1 unless told otherwise: in Docker/Railway SVA_HOST=0.0.0.0 (the platform's proxy is the entry).
const hostname = process.env.SVA_HOST ?? "127.0.0.1";
serve({ fetch, port, hostname }, ({ port }) => {
  console.log(
    production
      ? `Estampido (producción) → http://${hostname}:${port}  · web + API · límites por IP · publicar requiere WhatsApp`
      : `sva api → http://${hostname}:${port}/api`,
  );
});
