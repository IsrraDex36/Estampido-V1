import { randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { type Context, Hono } from "hono";
import type { BlankSchema } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import QRCode from "qrcode";
import { communityRoot } from "../../config/paths.js";
import { probe } from "../../core/probe/probe.js";
import { buildWhatsAppMp4 } from "../../core/video/whatsappMp4.js";
import { inspectWebp } from "../../core/webp/inspect.js";
import { type ConvertOptions, type ConvertResult, convertToSoundSticker } from "../../pipeline/convert.js";
import { Semaphore } from "../../utils/semaphore.js";
import { AccountRepo } from "./accounts/repo.js";
import { accountRoutes } from "./accounts/routes.js";
import { type AppEnv, sameOrigin, sessionCookie, sessionMiddleware } from "./accounts/session.js";
import { type BotClient, type BotPairing, BotRequestError, BotUnavailableError, createBotClient } from "./botClient.js";
import { clientHash } from "./client.js";
import { CommunityRepo } from "./community/repo.js";
import { communityRoutes, type PublishGuard, toStickerDto } from "./community/routes.js";
import {
  ADMIN_UNLINK_CONFIRM,
  ADMIN_WIPE_CONFIRM,
  type AdminCommunity,
  type AdminHealth,
  type AdminPairing,
  type ApiErrorBody,
  CLIENT_HEADER,
  type SendToWhatsAppResponse,
  type WhatsAppLink,
  type WhatsAppStatus,
} from "./contract.js";
import { FeedbackRepo } from "./feedback/repo.js";
import { feedbackRoutes } from "./feedback/routes.js";
import { ConversionQueue } from "./jobs/queue.js";
import { JobRegistry } from "./jobs/registry.js";
import { convertRoutes } from "./jobs/routes.js";
import { linkGreeting } from "./linkGreeting.js";
import { ModerationRepo } from "./moderation/repo.js";
import { moderationRoutes } from "./moderation/routes.js";
import { ResultStore, SERVABLE_FILES, type ServableFile } from "./resultStore.js";
import { OgImages } from "./social/og.js";
import { stampForPack } from "./social/packStamp.js";
import { SocialRepo } from "./social/repo.js";
import { socialRoutes } from "./social/routes.js";

export interface AppDeps {
  bot?: BotClient;
  store?: ResultStore;
  community?: CommunityRepo;
  /** Accounts (default: on top of the community database). */
  accounts?: AccountRepo;
  /** Reports and bans (default: on top of the community database). */
  moderation?: ModerationRepo;
  /** Feedback box (default: on top of the community database). */
  feedback?: FeedbackRepo;
  /** HTTPS deployment: `__Host-` session cookie with Secure. */
  secureCookies?: boolean;
  /** Public server: only signed-in users (login with WhatsApp) may publish (anti-spam, accountability). */
  publishRequiresLink?: boolean;
  /**
   * Owner's local mode (dev default): an unlinked browser sends to the bot's
   * own chat. NEVER on a public server (anyone could message the owner).
   */
  ownerSelfSend?: boolean;
  /**
   * Enables GET /api/admin/pairing (bot QR / code for the owner). Must be a long
   * random secret; unset or short → the endpoint doesn't exist (404).
   */
  adminToken?: string;
  convert?: (opts: ConvertOptions) => Promise<ConvertResult>;
  maxConcurrent?: number;
  maxQueue?: number;
  /** Refuse new conversions when the estimated wait exceeds this (s). */
  maxWaitSec?: number;
  /** Abort a conversion running longer than this (s). */
  jobTimeoutSec?: number;
  /** Inject a queue (tests). */
  queue?: ConversionQueue;
}

export { clientHash } from "./client.js";

/** "…6863" from a JID — never the full number in responses. */
const maskPhone = (jid: string): string => `…${(jid.split(/[:@]/)[0] ?? "").slice(-4)}`;

/** wa.me link that opens WhatsApp with the code pre-typed. */
export const waLink = (botNumber: string | null | undefined, code: string): string | null =>
  botNumber ? `https://wa.me/${botNumber}?text=${encodeURIComponent(linkGreeting(code))}` : null;

const fail = (code: string, message: string): ApiErrorBody => ({
  error: { code, message },
});

export type ApiApp = Hono<AppEnv, BlankSchema, "/api">;

export function createApp(deps: AppDeps = {}): ApiApp {
  const store = deps.store ?? new ResultStore();
  const bot = deps.bot ?? createBotClient();
  const convert = deps.convert ?? convertToSoundSticker;
  const conversionQueue =
    deps.queue ??
    new ConversionQueue({
      concurrency: deps.maxConcurrent ?? 2,
      maxQueued: deps.maxQueue ?? 20,
      maxWaitSec: deps.maxWaitSec ?? 150,
      jobTimeoutSec: deps.jobTimeoutSec ?? 180,
    });
  const jobRegistry = new JobRegistry();
  /** WhatsApp-MP4 exports: short, but CPU too — one at a time, apart from the sticker queue. */
  const mp4Jobs = new Semaphore(1);

  const app = new Hono<AppEnv>().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  // Accounts: every request knows its user; cookie writes must be same-origin.
  const communityRepo = deps.community ?? new CommunityRepo(communityRoot());
  const accounts = deps.accounts ?? new AccountRepo(communityRepo);
  const cookie = sessionCookie(deps.secureCookies ?? false);
  app.use("*", sessionMiddleware(accounts, cookie));
  app.use("*", sameOrigin(cookie, { allowLocalhost: !deps.secureCookies }));

  // Public server: publishing needs an account (login with WhatsApp): every
  // public sticker has a creator who can be moderated.
  const canPublish: PublishGuard | undefined = deps.publishRequiresLink
    ? async (c) =>
        c.get("user")
          ? null
          : {
              status: 403 as const,
              body: fail("link_required", "Entra con tu WhatsApp para publicar en la comunidad."),
            }
    : undefined;
  app.route(
    "/community",
    communityRoutes(communityRepo, store, { canPublish, isAdmin: (c) => adminDenied(c) === null }),
  );
  const social = new SocialRepo(communityRepo);
  app.route(
    "/",
    accountRoutes({
      accounts,
      community: communityRepo,
      bot,
      cookie,
      isFollowing: (a, b) => social.isFollowing(a, b),
    }),
  );
  app.route(
    "/",
    socialRoutes({
      social,
      accounts,
      community: communityRepo,
      og: new OgImages(join(dirname(communityRepo.dbPath), "_og")),
    }),
  );

  // Conversions: admission-controlled queue, sync or background jobs.
  app.route("/", convertRoutes({ store, convert, queue: conversionQueue, registry: jobRegistry }));

  app.get("/whatsapp/status", async (c) =>
    c.json({ ...(await bot.status()), selfSend: deps.ownerSelfSend === true } satisfies WhatsAppStatus),
  );

  /** Bot failures → uniform JSON (unavailable 503, known 4xx from the bot, else 502). */
  const botFailure = (c: Context, err: unknown, what: string) => {
    if (err instanceof BotUnavailableError) return c.json(fail("bot_unavailable", err.message), 503);
    if (err instanceof BotRequestError && err.status < 500) {
      return c.json(fail(err.code, err.message), err.status as ContentfulStatusCode);
    }
    console.error(`[whatsapp:${what}]`, err);
    return c.json(fail("send_failed", "No se pudo completar con WhatsApp."), 502);
  };

  // ── Owner: link the BOT itself (QR shown big in /admin, token-protected) ──
  const adminToken = deps.adminToken && deps.adminToken.length >= 16 ? deps.adminToken : null;
  /** null = allowed; else the response to return (404 when /admin is off, 401 bad password). */
  const adminDenied = (c: Context) => {
    if (!adminToken) return c.json(fail("not_found", "Ruta de la API no encontrada."), 404);
    const given = Buffer.from(c.req.header("authorization")?.replace(/^Bearer /, "") ?? "");
    const want = Buffer.from(adminToken);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      return c.json(fail("unauthorized", "Contraseña incorrecta."), 401);
    }
    c.header("Cache-Control", "no-store");
    return null;
  };

  app.get("/admin/health", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    try {
      return c.json((await bot.health()) satisfies AdminHealth);
    } catch {
      return c.json({
        status: "offline",
        since: null,
        connected: false,
        lastInboundAt: null,
        lastProbeOkAt: null,
        decryptFailuresRecent: 0,
        reconnects24h: 0,
        problems: ["El bot no está corriendo."],
      } satisfies AdminHealth);
    }
  });

  // ── Owner: community moderation ──────────────────────────────────────────
  // Reports (public) + review queue and creator blocking (admin).
  const moderation = deps.moderation ?? new ModerationRepo(communityRepo);
  app.route("/", moderationRoutes({ moderation, accounts, adminDenied }));
  // Feedback box (anyone) + admin inbox.
  app.route("/", feedbackRoutes({ feedback: deps.feedback ?? new FeedbackRepo(communityRepo), adminDenied }));

  app.get("/admin/community", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const [all, reports] = await Promise.all([communityRepo.listAll(), moderation.reportCounts()]);
    return c.json({
      items: all.map((s) => ({
        ...toStickerDto(s),
        sends: s.sends ?? 0,
        plays: s.plays ?? 0,
        reports: reports.get(s.id) ?? 0,
      })),
      usedBytes: await communityRepo.usedBytes(),
    } satisfies AdminCommunity);
  });

  app.delete("/admin/community/stickers/:id", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!(await communityRepo.remove(id))) return c.json(fail("not_found", "Ese sticker ya no existe."), 404);
    console.log(`[admin] sticker de la comunidad borrado: ${id}`);
    return c.json({ removed: 1 });
  });

  app.delete("/admin/community", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== ADMIN_WIPE_CONFIRM) {
      return c.json(fail("confirm_required", `Escribe «${ADMIN_WIPE_CONFIRM}» para confirmar.`), 400);
    }
    const removed = await communityRepo.clear();
    console.log(`[admin] comunidad vaciada: ${removed} stickers borrados`);
    return c.json({ removed });
  });

  // Owner: unlink the bot's WhatsApp (change number) without touching the old phone.
  app.post("/admin/bot/unlink", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== ADMIN_UNLINK_CONFIRM) {
      return c.json(fail("confirm_required", `Escribe «${ADMIN_UNLINK_CONFIRM}» para confirmar.`), 400);
    }
    if (!bot.unlinkBot) return c.json(fail("bot_unavailable", "No disponible."), 503);
    try {
      await bot.unlinkBot();
    } catch (err) {
      return botFailure(c, err, "admin-unlink");
    }
    console.log("[admin] bot desvinculado desde /admin");
    return c.json({ ok: true });
  });

  app.get("/admin/pairing", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    let p: BotPairing;
    try {
      p = await bot.pairing();
    } catch {
      return c.json({ state: "offline" } satisfies AdminPairing);
    }
    if (p.kind === "qr") {
      const qrSvg = await QRCode.toString(p.qr, { type: "svg", margin: 2, errorCorrectionLevel: "L" });
      return c.json({ state: "qr", qrSvg } satisfies AdminPairing);
    }
    if (p.kind === "code") return c.json({ state: "code", code: p.code } satisfies AdminPairing);
    if (p.kind === "connected") return c.json({ state: "connected", phone: maskPhone(p.id) } satisfies AdminPairing);
    return c.json({ state: "waiting" } satisfies AdminPairing);
  });

  // ── "This browser ↔ my WhatsApp" link (code sent from the user's WhatsApp) ──
  app.get("/whatsapp/link", async (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    try {
      const st = await bot.linkStatus(client);
      // The account key is server-side identity only: never sent to the browser.
      if (st.state === "linked") {
        return c.json({ state: "linked", phone: st.phone, linkedAt: st.linkedAt } satisfies WhatsAppLink);
      }
      if (st.state !== "pending") return c.json(st satisfies WhatsAppLink);
      const { botNumber } = await bot.status();
      return c.json({ ...st, waLink: waLink(botNumber, st.code) } satisfies WhatsAppLink);
    } catch (err) {
      return botFailure(c, err, "link-status");
    }
  });

  app.post("/whatsapp/link", async (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    try {
      const { code, expiresAt } = await bot.createLink(client);
      const { botNumber } = await bot.status();
      return c.json({ state: "pending", code, expiresAt, waLink: waLink(botNumber, code) } satisfies WhatsAppLink);
    } catch (err) {
      return botFailure(c, err, "link-create");
    }
  });

  app.delete("/whatsapp/link", async (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    // Unlinking this browser also signs it out of its account.
    await accounts.deleteSessionsForClient(client);
    cookie.clear(c);
    try {
      await bot.unlink(client);
      return c.json({ state: "unlinked" } satisfies WhatsAppLink);
    } catch (err) {
      return botFailure(c, err, "unlink");
    }
  });

  // Send a finished result to THIS browser's linked chat as a native sound sticker.
  /**
   * Send a sticker (+ optional sound) to THIS browser's linked chat. Shared by
   * fresh results and community stickers: same link rule, limits and fallback.
   */
  const sendToLinkedChat = async (
    c: Context,
    files: { webpPath: string; oggPath: string | null },
  ): Promise<Response> => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    const webp = await readFile(files.webpPath).catch(() => null);
    if (!webp) return c.json(fail("expired", "El sticker ya no existe."), 404);
    const hasAudio =
      files.oggPath !== null &&
      (await stat(files.oggPath).then(
        () => true,
        () => false,
      ));
    try {
      const sent = await bot.send({
        client,
        ...(deps.ownerSelfSend ? { fallbackToSelf: true } : {}),
        webpPath: files.webpPath,
        animated: inspectWebp(webp).animated,
        ...(hasAudio && files.oggPath
          ? { audioPath: files.oggPath, audioDurationSec: (await probe(files.oggPath)).durationSec }
          : {}),
      });
      return c.json(sent satisfies SendToWhatsAppResponse);
    } catch (err) {
      return botFailure(c, err, "send");
    }
  };

  app.post("/results/:id/whatsapp", async (c) => {
    const webpPath = store.resolve(c.req.param("id"), "sticker.webp");
    if (!webpPath) return c.json(fail("not_found", "Resultado no encontrado."), 404);
    const exists = await stat(webpPath).then(
      () => true,
      () => false,
    );
    if (!exists) return c.json(fail("expired", "El resultado expiró o no existe."), 404);
    return sendToLinkedChat(c, { webpPath, oggPath: store.resolve(c.req.param("id"), "sticker.ogg") });
  });

  // Community stickers live on (no 30-min expiry): anyone linked can get one in their chat.
  app.post("/community/stickers/:id/whatsapp", async (c) => {
    const id = c.req.param("id");
    const sticker = await communityRepo.get(id);
    const webp = sticker ? await communityRepo.resolveFile(id, "sticker.webp") : null;
    if (!sticker || sticker.hidden || !webp) return c.json(fail("not_found", "Sticker no encontrado."), 404);
    const ogg = sticker.soundSec !== null ? await communityRepo.resolveFile(id, "sticker.ogg") : null;
    // Sent from a pack → a copy stamped with the pack's name and the app's mark (30-min temp).
    let webpPath = webp.path;
    const packId = c.req.query("pack");
    if (packId) {
      const pack = await social.pack(packId);
      if (!pack || !(await social.packContains(pack.id, id))) {
        return c.json(fail("not_found", "Ese sticker ya no está en el pack."), 404);
      }
      const tmp = await store.create();
      webpPath = await stampForPack(webp.path, pack, tmp.dir);
    }
    const res = await sendToLinkedChat(c, { webpPath, oggPath: ogg?.path ?? null });
    if (res.ok) await communityRepo.recordSend(id).catch(() => {}); // a ranking signal; never fails the send
    return res;
  });

  // «Exportar para WhatsApp»: square MP4 for WhatsApp's own «Crear sticker»,
  // built once on first request (same queue as conversions) from the finished sticker.
  const mp4Builds = new Map<string, Promise<void>>();
  app.get("/results/:id/whatsapp.mp4", async (c) => {
    const id = c.req.param("id");
    const webpPath = store.resolve(id, "sticker.webp");
    const mp4Path = store.resolve(id, "whatsapp.mp4");
    if (!webpPath || !mp4Path) return c.json(fail("not_found", "Resultado no encontrado."), 404);
    const webp = await readFile(webpPath).catch(() => null);
    if (!webp) return c.json(fail("expired", "El resultado expiró o no existe."), 404);

    if (!(await stat(mp4Path).catch(() => null))) {
      let build = mp4Builds.get(id);
      if (!build) {
        // Registered synchronously (no await before the set): concurrent requests share one build.
        const oggPath = store.resolve(id, "sticker.ogg") as string;
        const tmp = `${mp4Path}.${randomUUID()}.part.mp4`;
        build = mp4Jobs
          .run(async () => {
            const hasAudio = Boolean(await stat(oggPath).catch(() => null));
            await buildWhatsAppMp4({
              webp: webpPath,
              animated: inspectWebp(webp).animated,
              output: tmp,
              ...(hasAudio ? { audio: oggPath, audioDurationSec: (await probe(oggPath)).durationSec } : {}),
            });
            await rename(tmp, mp4Path);
          })
          .catch(async (err) => {
            await rm(tmp, { force: true });
            throw err;
          })
          .finally(() => mp4Builds.delete(id));
        mp4Builds.set(id, build);
      }
      try {
        await build;
      } catch (err) {
        console.error("[whatsapp.mp4]", err instanceof Error ? err.message : err);
        return c.json(fail("unprocessable", "No se pudo preparar el video para WhatsApp."), 422);
      }
    }
    const info = await stat(mp4Path);
    return new Response(Readable.toWeb(createReadStream(mp4Path)) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=1800",
        "Content-Disposition": 'attachment; filename="estampido-para-whatsapp.mp4"',
      },
    });
  });

  app.get("/results/:id/:file", async (c) => {
    const { id, file } = c.req.param();
    const path = store.resolve(id, file);
    if (!path) return c.json(fail("not_found", "Archivo no encontrado."), 404);
    const info = await stat(path).catch(() => null);
    if (!info) return c.json(fail("expired", "El resultado expiró o no existe."), 404);

    const download = c.req.query("download") !== undefined;
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: {
        "Content-Type": SERVABLE_FILES[file as ServableFile],
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=1800",
        ...(download ? { "Content-Disposition": `attachment; filename="${file}"` } : {}),
      },
    });
  });

  // Uniform JSON errors: unknown endpoints and unexpected failures never answer HTML/text.
  app.notFound((c) => c.json(fail("not_found", "Ruta de la API no encontrada."), 404));
  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json(fail("internal", "Error interno del servidor."), 500);
  });

  return app;
}
