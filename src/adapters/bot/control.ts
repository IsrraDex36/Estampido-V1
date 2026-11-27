import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpath, rm, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer, type Server } from "node:net";
import { sep } from "node:path";
import { serve } from "@hono/node-server";
import { jidNormalizedUser, type WASocket } from "baileys";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { STICKER_LIMITS } from "../../config/limits.js";
import { communityRoot, controlFile, RESULTS_ROOT } from "../../config/paths.js";
import { RateLimiter } from "../../utils/rateLimit.js";
import { accountKeyFor, loadAccountSecret } from "./accountKey.js";
import { jidDigits } from "./command.js";
import type { PairingState } from "./connection.js";
import { humanizer } from "./humanize.js";
import { isClientHash, type LinkStore, maskJid } from "./links.js";
import { type SelfSessions, SessionError } from "./selfSession.js";
import { sendSoundSticker } from "./soundSticker.js";
import type { HealthReport } from "./watchdog.js";

/**
 * Local control endpoint so the web/API can say "send this result to my
 * WhatsApp". Hardening:
 * - binds 127.0.0.1 only, random bearer token in .auth/control.json (0600)
 * - destination is ALWAYS the chat linked to that web client (a code the
 *   user sent from their own WhatsApp) — never an arbitrary number
 * - per-chat send limit
 * - only .webp/.ogg files inside the results or community folders can be sent (realpath-checked)
 */
export interface BotHandle {
  current(): WASocket | null;
  /** Link store for the connected bot number (null while disconnected). */
  links(): LinkStore | null;
  /** Bot linking progress (QR / code / connected) for the admin page. */
  pairing?(): PairingState;
  /** Watchdog report for the admin page. */
  health?(): HealthReport;
  /** Log the bot's WhatsApp out and start a fresh pairing (owner, from /admin). */
  unlinkBot?(): Promise<void>;
  /** «Tu propio WhatsApp»: per-person linked device, sends only to the person's own chat. */
  self?: SelfSessions;
}

export const SENDS_PER_MINUTE = 10;

const sendSchema = z.object({
  client: z.string().refine(isClientHash, "cliente inválido"),
  /** Owner's local mode: no link for this client → send to the bot's own chat. */
  fallbackToSelf: z.boolean().optional(),
  webpPath: z.string().min(1),
  audioPath: z.string().min(1).optional(),
  // Same ceiling as the pipeline (+1 s: containers report e.g. 180.0065 s).
  audioDurationSec: z
    .number()
    .positive()
    .max(Math.max(STICKER_LIMITS.maxDurationSec, STICKER_LIMITS.maxImageAudioSec) + 1)
    .optional(),
  animated: z.boolean(),
});
export type SendToSelfRequest = z.infer<typeof sendSchema>;
export interface SendToSelfResponse {
  delivered: "native" | "separate" | "sticker";
}

/**
 * Folders the API may ask the bot to send from: fresh results (30 min) and
 * the community library. Both processes resolve them from the same env.
 */
export const sendableRoots = (): string[] => [RESULTS_ROOT, communityRoot()];

/**
 * Resolve symlinks and require the file to live under one of `roots` (missing
 * roots are skipped). Optional extension check: only stickers/sounds leave the box.
 */
export async function assertResultFile(
  path: string,
  roots: string | string[] = sendableRoots(),
  ext?: RegExp,
): Promise<string> {
  if (ext && !ext.test(path)) throw new Error("file type not allowed");
  const real = await realpath(path);
  const realRoots = (await Promise.allSettled((Array.isArray(roots) ? roots : [roots]).map((r) => realpath(r))))
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
  if (!realRoots.some((root) => real.startsWith(root + sep))) throw new Error("path outside the allowed folders");
  return real;
}

const tokenMatches = (header: string | undefined, token: string): boolean => {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

export function createControlApp(
  bot: BotHandle,
  token: string,
  roots: string | string[] = sendableRoots(),
  accountSecret: Buffer | null = null,
): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (!tokenMatches(c.req.header("authorization"), token)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  const perChat = new RateLimiter(SENDS_PER_MINUTE);

  app.get("/status", (c) => {
    const sock = bot.current();
    // The bot's own number: the web builds wa.me/<number> links with it.
    const v = humanizer.volume.report();
    return c.json({
      connected: Boolean(sock?.user),
      botNumber: jidDigits(sock?.user?.id),
      pace: { ...v.limits, lastMinute: v.lastMinute, lastHour: v.lastHour },
    });
  });

  app.get("/health", (c) => (bot.health ? c.json(bot.health()) : c.json({ error: "sin vigilante" }, 404)));

  app.get("/pairing", (c) => c.json(bot.pairing?.() ?? ({ kind: "waiting" } satisfies PairingState)));

  // ── «Tu propio WhatsApp» (self sessions; work even while the bot number is offline) ──
  // Every call names the browser (client hash): sessions and pending links are bound to it.
  const SELF_STATUS = {
    invalid: 400,
    expired: 410,
    logged_out: 410,
    rate_limited: 429,
    timeout: 504,
    busy: 503,
    send_failed: 502,
  } as const;
  const selfError = (c: Context, err: unknown) => {
    if (err instanceof SessionError) {
      // Diagnosis without data: only the reason code (never the session, number or files).
      if (err.code !== "rate_limited") console.warn(`[self] ${c.req.path.split("/")[2] ?? "?"} rechazado: ${err.code}`);
      return c.json({ error: err.message, code: err.code }, SELF_STATUS[err.code]);
    }
    console.error("[self]", err instanceof Error ? err.message : "error"); // never log request bodies (sessions)
    return c.json({ error: "No se pudo completar con tu WhatsApp.", code: "send_failed" }, 502);
  };
  const clientField = z.string().refine(isClientHash);
  const selfSend = z.object({
    client: clientField,
    session: z.string().min(10).max(3_000_000),
    items: z
      .array(
        z
          .object({
            webpPath: z.string().min(1).max(1024),
            audioPath: z.string().min(1).max(1024).optional(),
            audioDurationSec: z
              .number()
              .positive()
              .max(STICKER_LIMITS.maxDurationSec + 1)
              .optional(),
            animated: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  });
  const selfLink = z
    .object({
      client: clientField,
      phone: z
        .string()
        .regex(/^\d{8,15}$/)
        .optional(),
    })
    .strict();
  const selfLogout = z.object({ client: clientField, session: z.string().min(10).max(3_000_000) }).strict();
  // «bad_request», never «invalid»: the web forgets the session only on «invalid» (session unusable).
  const bad = (c: Context) => c.json({ error: "Solicitud no válida.", code: "bad_request" }, 400);
  /** Same account key as the code-to-bot sign-in had: the same person keeps the same account. */
  const identity = (jid: string) => ({
    phone: maskJid(jid),
    ...(accountSecret && jid ? { account: accountKeyFor(jid, accountSecret) } : {}),
  });

  app.post("/self/link", async (c) => {
    if (!bot.self) return c.json({ error: "No disponible." }, 404);
    const parsed = selfLink.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c);
    try {
      return c.json({ id: await bot.self.startLink(parsed.data.client, parsed.data.phone) });
    } catch (err) {
      return selfError(c, err);
    }
  });
  app.get("/self/link/:id", (c) => {
    const client = c.req.query("client") ?? "";
    if (!isClientHash(client)) return bad(c);
    const st = bot.self?.linkStatus(c.req.param("id"), client);
    if (!st) return c.json({ error: "La vinculación venció. Intenta otra vez.", code: "link_expired" }, 404);
    if (st.state !== "linked") return c.json(st);
    // The number never leaves the bot: the API gets the masked hint and the opaque account key.
    return c.json({ state: "linked", session: st.session, ...identity(st.me) });
  });
  /** Sign in again from a sealed session (no WhatsApp connection involved). */
  app.post("/self/whoami", async (c) => {
    if (!bot.self) return c.json({ error: "No disponible." }, 404);
    const parsed = selfLogout.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c);
    try {
      return c.json(identity(bot.self.whoAmI(parsed.data.session, parsed.data.client)));
    } catch (err) {
      return selfError(c, err);
    }
  });
  app.post("/self/send", async (c) => {
    if (!bot.self) return c.json({ error: "No disponible." }, 404);
    const parsed = selfSend.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c);
    try {
      // Only result/community files may leave the box (no arbitrary server files).
      const items = await Promise.all(
        parsed.data.items.map(async (it) => ({
          ...it,
          webpPath: await assertResultFile(it.webpPath, sendableRoots(), /\.webp$/),
          audioPath: it.audioPath ? await assertResultFile(it.audioPath, sendableRoots(), /\.ogg$/) : undefined,
        })),
      ).catch(() => null);
      if (!items) return c.json({ error: "Uno de los stickers no se puede enviar.", code: "bad_request" }, 400);
      const { result, session } = await bot.self.sendToSelf(parsed.data.session, parsed.data.client, items);
      return c.json({ sent: result.sent, session });
    } catch (err) {
      return selfError(c, err);
    }
  });
  app.post("/self/logout", async (c) => {
    if (!bot.self) return c.json({ error: "No disponible." }, 404);
    const parsed = selfLogout.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c);
    try {
      await bot.self.logout(parsed.data.session, parsed.data.client);
      return c.json({ ok: true });
    } catch (err) {
      return selfError(c, err);
    }
  });

  app.post("/admin/unlink", async (c) => {
    if (!bot.unlinkBot) return c.json({ error: "No disponible." }, 404);
    await bot.unlinkBot();
    return c.json({ ok: true });
  });

  // ── Links ────────────────────────────────────────────────────────────────
  const storeOr503 = () => bot.links();

  app.post("/links", async (c) => {
    const store = storeOr503();
    if (!store) return c.json({ error: "Bot no conectado." }, 503);
    const body = (await c.req.json().catch(() => null)) as { client?: string } | null;
    if (!body?.client || !isClientHash(body.client))
      return c.json({ error: "No pudimos reconocer este navegador. Recarga la página." }, 400);
    try {
      return c.json(store.createCode(body.client));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "No se pudo crear el código." }, 429);
    }
  });

  app.get("/links/:client", async (c) => {
    const store = storeOr503();
    if (!store) return c.json({ error: "Bot no conectado." }, 503);
    const client = c.req.param("client");
    if (!isClientHash(client)) return c.json({ error: "No pudimos reconocer este navegador. Recarga la página." }, 400);
    const st = await store.status(client);
    // Never return the full number: the browser only needs "…5678"; the API
    // gets an opaque account key (HMAC) to recognize the same person.
    if (st.state !== "linked") return c.json(st);
    return c.json({
      state: "linked",
      phone: maskJid(st.jid),
      linkedAt: st.linkedAt,
      ...(accountSecret ? { account: accountKeyFor(st.identity ?? st.jid, accountSecret) } : {}),
    });
  });

  app.delete("/links/:client", async (c) => {
    const store = storeOr503();
    if (!store) return c.json({ error: "Bot no conectado." }, 503);
    const client = c.req.param("client");
    if (!isClientHash(client)) return c.json({ error: "No pudimos reconocer este navegador. Recarga la página." }, 400);
    return c.json({ removed: await store.unlink(client) });
  });

  // ── Send to the client's linked chat ─────────────────────────────────────
  app.post("/send", async (c) => {
    const sock = bot.current();
    const store = bot.links();
    if (!sock?.user || !store) return c.json({ error: "Bot no conectado." }, 503);
    const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const why = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error("[control] petición inválida:", why);
      return c.json({ error: `Petición inválida (${why}).` }, 400);
    }

    let webpPath: string;
    let audioPath: string | undefined;
    try {
      webpPath = await assertResultFile(parsed.data.webpPath, roots, /\.webp$/i);
      if (parsed.data.audioPath) audioPath = await assertResultFile(parsed.data.audioPath, roots, /\.ogg$/i);
    } catch (err) {
      console.error("[control] archivo rechazado:", err instanceof Error ? err.message : err);
      return c.json({ error: "El sticker ya no está disponible. Vuelve a crearlo o recarga la comunidad." }, 403);
    }

    const target =
      (await store.target(parsed.data.client)) ?? (parsed.data.fallbackToSelf ? jidNormalizedUser(sock.user.id) : null);
    if (!target) return c.json({ error: "Este navegador no tiene un WhatsApp vinculado.", code: "not_linked" }, 409);
    const wait = perChat.take(target);
    if (wait > 0) {
      return c.json({ error: `Vas muy rápido: espera ${Math.ceil(wait / 1000)} s.`, code: "rate_limited" }, 429);
    }
    try {
      if (audioPath && parsed.data.audioDurationSec) {
        try {
          await humanizer.pacer.turn(); // shared gap with every other outgoing message
          await sendSoundSticker(sock, target, {
            webpPath,
            audioPath,
            audioDurationSec: parsed.data.audioDurationSec,
            animated: parsed.data.animated,
          });
          return c.json({ delivered: "native" } satisfies SendToSelfResponse);
        } catch (err) {
          // Plan B (same as /saudio): the sticker + its sound as a voice note.
          console.error(
            "[control] envío nativo falló; mando sticker + nota de voz:",
            err instanceof Error ? err.message : err,
          );
          await humanizer.pacer.turn();
          await sock.sendMessage(target, { sticker: { url: webpPath } });
          await humanizer.pacer.turn();
          await sock.sendMessage(target, { audio: { url: audioPath }, mimetype: "audio/ogg; codecs=opus", ptt: true });
          return c.json({ delivered: "separate" } satisfies SendToSelfResponse);
        }
      }
      await humanizer.pacer.turn();
      await sock.sendMessage(target, { sticker: { url: webpPath } });
      return c.json({ delivered: "sticker" } satisfies SendToSelfResponse);
    } catch (err) {
      console.error("[control] envío falló", err);
      return c.json({ error: "WhatsApp rechazó el envío." }, 502);
    }
  });
  return app;
}

/** Find a free localhost port (when SVA_CONTROL_PORT isn't set). */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv: Server = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });

/** Start the control server and publish `{ port, token }` for the API. */
export async function startControlServer(bot: BotHandle): Promise<{ port: number; close: () => Promise<void> }> {
  const token = randomBytes(32).toString("hex");
  const port = Number(process.env.SVA_CONTROL_PORT) || (await freePort());
  const secret = await loadAccountSecret();
  const server = serve({
    fetch: createControlApp(bot, token, sendableRoots(), secret).fetch,
    port,
    hostname: "127.0.0.1",
  });
  const file = controlFile();
  await writeFile(file, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });

  const close = async () => {
    server.close();
    await rm(file, { force: true });
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => void close().finally(() => process.exit(0)));
  }
  return { port, close };
}
