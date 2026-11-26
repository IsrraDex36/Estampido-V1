import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { communityRoot } from "../../config/paths.js";
import { consoleSink, fanOut, webhookSink } from "../../utils/alerts.js";
import { AccountRepo } from "./accounts/repo.js";
import { createApp } from "./app.js";
import { Backups } from "./backups.js";
import { createBotClient } from "./botClient.js";
import { BotMonitor } from "./botMonitor.js";
import { CommunityRepo } from "./community/repo.js";
import { ResultStore } from "./resultStore.js";
import { createServerApp, parseLimits } from "./server.js";
import { SocialRepo } from "./social/repo.js";

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
/** Positive integer from an env var, else undefined. */
const num = (v: string | undefined) => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : undefined);
const store = new ResultStore();
const maxMb = Number(process.env.SVA_COMMUNITY_MAX_MB ?? (production ? 2048 : 0)) || Number.POSITIVE_INFINITY;
const community = new CommunityRepo(communityRoot(), Date.now, maxMb * 1024 * 1024);
const accounts = new AccountRepo(community);
const social = new SocialRepo(community);
// Open (and migrate) the community database now, so a problem shows at boot.
const stats = await community.stats();
const purge = () =>
  Promise.all([accounts.purgeExpiredSessions(), community.purgePlayMarks()]).catch((err) =>
    console.error("[limpieza]", err),
  );
await purge();
setInterval(purge, 6 * 3_600_000).unref();
console.log(`Comunidad (SQLite): ${stats.stickers} stickers, ${stats.sounds} sonidos · ${community.dbPath}`);
const backups = production
  ? new Backups(resolve(process.env.SVA_DATA_DIR ?? ".data", "backups"), community)
  : undefined;
const api = createApp({
  backups,
  // The owner publishes in batches: no per-account quota for these handles.
  unlimitedHandles: process.env.SVA_UNLIMITED_HANDLES?.split(","),
  store,
  community,
  accounts,
  secureCookies: production,
  publishRequiresLink: flag(process.env.SVA_PUBLISH_REQUIRES_LINK, production),
  // Local dev: send to your own chat without linking. Off in production (public).
  ownerSelfSend: flag(process.env.SVA_OWNER_SELF_SEND, !production),
  // /admin: link the bot from the browser (QR / code). Off unless a long secret is set.
  adminToken: process.env.SVA_ADMIN_TOKEN,
  // Conversion queue: ≈ one FFmpeg per core (more only slows each one down).
  maxConcurrent: num(process.env.SVA_MAX_CONCURRENT) ?? Math.min(4, Math.max(1, availableParallelism())),
  maxQueue: num(process.env.SVA_MAX_QUEUE) ?? 20,
  maxWaitSec: num(process.env.SVA_MAX_WAIT_SEC) ?? 150,
  jobTimeoutSec: num(process.env.SVA_JOB_TIMEOUT_SEC) ?? 180,
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
    // Creator profiles get their own title/description (shared links, search).
    // Creator profiles and packs get their own title/description/preview image (shared links, search).
    dynamicSeo: async (path) => {
      const packId = /^\/p\/([0-9a-f-]{36})$/i.exec(path)?.[1];
      if (packId) {
        const p = await social.pack(packId.toLowerCase());
        if (!p || p.count === 0) return null;
        return {
          title: `${p.name} · pack de @${p.owner.handle} en Estampido`,
          description: `${p.count} ${p.count === 1 ? "sticker" : "stickers"} con sonido. Ábrelo y mándalos todos a tu WhatsApp en un toque.`,
          image: `/api/og/pack/${p.id}.png?v=${p.updatedAt}`,
          imageAlt: `Stickers del pack ${p.name}`,
        };
      }
      const handle = /^\/u\/([a-z0-9_]{3,20})$/i.exec(path)?.[1];
      const user = handle ? await accounts.byHandle(handle.toLowerCase()) : null;
      if (!user || user.banned) return null;
      const stats = await accounts.stats(user.id);
      return {
        title: `${user.displayName} (@${user.handle}) · Creador en Estampido`,
        description:
          user.bio ||
          `${stats.stickers} stickers con sonido de ${user.displayName} en Estampido. Escúchalos y mándalos a tu WhatsApp.`,
        image: `/api/og/creator/${user.handle}.png?v=${stats.stickers}`,
        imageAlt: `Stickers de ${user.displayName}`,
      };
    },
  }).fetch;
}

// Daily database backups (production): /data/backups, 7 daily + 4 weekly, downloadable in /admin.
if (production && backups) {
  backups.start();
  console.log(`Respaldos diarios en ${backups.dir}`);
}

// Bot monitor (production + SVA_ALERT_WEBHOOK): alerts if the bot process dies
// or WhatsApp stays disconnected > 5 min — the bot's own watchdog can't report that.
const alertWebhook = process.env.SVA_ALERT_WEBHOOK?.trim();
if (production && alertWebhook) {
  const botClient = createBotClient(undefined, 10_000);
  new BotMonitor({ status: () => botClient.status(), alert: fanOut(consoleSink, webhookSink(alertWebhook)) }).start();
  console.log("Monitor del bot: alertas por webhook si se cae más de 5 min.");
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
