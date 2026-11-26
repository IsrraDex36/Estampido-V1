import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpath, rm, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer, type Server } from "node:net";
import { sep } from "node:path";
import { serve } from "@hono/node-server";
import { jidNormalizedUser, type WASocket } from "baileys";
import { Hono } from "hono";
import { z } from "zod";
import { STICKER_LIMITS } from "../../config/limits.js";
import { communityRoot, controlFile, RESULTS_ROOT } from "../../config/paths.js";
import { RateLimiter } from "../../utils/rateLimit.js";
import { accountKeyFor, loadAccountSecret } from "./accountKey.js";
import { jidDigits } from "./command.js";
import type { PairingState } from "./connection.js";
import { humanizer } from "./humanize.js";
import { isClientHash, type LinkStore, maskJid } from "./links.js";
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
    return c.json({ connected: Boolean(sock?.user), botNumber: jidDigits(sock?.user?.id) });
  });

  app.get("/health", (c) => (bot.health ? c.json(bot.health()) : c.json({ error: "sin vigilante" }, 404)));

  app.get("/pairing", (c) => c.json(bot.pairing?.() ?? ({ kind: "waiting" } satisfies PairingState)));

  // ── Links ────────────────────────────────────────────────────────────────
  const storeOr503 = () => bot.links();

  app.post("/links", async (c) => {
    const store = storeOr503();
    if (!store) return c.json({ error: "Bot no conectado." }, 503);
    const body = (await c.req.json().catch(() => null)) as { client?: string } | null;
    if (!body?.client || !isClientHash(body.client)) return c.json({ error: "cliente inválido" }, 400);
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
    if (!isClientHash(client)) return c.json({ error: "cliente inválido" }, 400);
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
    if (!isClientHash(client)) return c.json({ error: "cliente inválido" }, 400);
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
