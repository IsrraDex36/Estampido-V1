import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpath, rm, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer, type Server } from "node:net";
import { sep } from "node:path";
import { serve } from "@hono/node-server";
import { jidNormalizedUser, type WASocket } from "baileys";
import { Hono } from "hono";
import { z } from "zod";
import { controlFile, RESULTS_ROOT } from "../../config/paths.js";
import { sendSoundSticker } from "./soundSticker.js";

/**
 * Local control endpoint so the web/API can say "send this result to my
 * WhatsApp". Hardening:
 * - binds 127.0.0.1 only, random bearer token in .auth/control.json (0600)
 * - destination is ALWAYS the bot owner's own chat (no arbitrary numbers)
 * - only files inside the API results folder can be sent (realpath-checked)
 */
export interface BotHandle {
  current(): WASocket | null;
}

const sendSchema = z.object({
  webpPath: z.string().min(1),
  audioPath: z.string().min(1).optional(),
  audioDurationSec: z.number().positive().max(60).optional(),
  animated: z.boolean(),
});
export type SendToSelfRequest = z.infer<typeof sendSchema>;
export interface SendToSelfResponse {
  delivered: "native" | "sticker";
}

/** Resolve symlinks and require the file to live under RESULTS_ROOT. */
export async function assertResultFile(path: string, root = RESULTS_ROOT): Promise<string> {
  const [real, realRoot] = await Promise.all([realpath(path), realpath(root)]);
  if (!real.startsWith(realRoot + sep)) throw new Error("path outside results folder");
  return real;
}

const tokenMatches = (header: string | undefined, token: string): boolean => {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

export function createControlApp(bot: BotHandle, token: string, resultsRoot = RESULTS_ROOT): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (!tokenMatches(c.req.header("authorization"), token)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/status", (c) => {
    const sock = bot.current();
    return c.json({ connected: Boolean(sock?.user) });
  });

  app.post("/send-self", async (c) => {
    const sock = bot.current();
    if (!sock?.user) return c.json({ error: "Bot no conectado." }, 503);
    const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Petición inválida." }, 400);

    let webpPath: string;
    let audioPath: string | undefined;
    try {
      webpPath = await assertResultFile(parsed.data.webpPath, resultsRoot);
      if (parsed.data.audioPath) audioPath = await assertResultFile(parsed.data.audioPath, resultsRoot);
    } catch {
      return c.json({ error: "Archivo no permitido o inexistente." }, 403);
    }

    const self = jidNormalizedUser(sock.user.id);
    try {
      if (audioPath && parsed.data.audioDurationSec) {
        await sendSoundSticker(sock, self, {
          webpPath,
          audioPath,
          audioDurationSec: parsed.data.audioDurationSec,
          animated: parsed.data.animated,
        });
        return c.json({ delivered: "native" } satisfies SendToSelfResponse);
      }
      await sock.sendMessage(self, { sticker: { url: webpPath } });
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
  const server = serve({ fetch: createControlApp(bot, token).fetch, port, hostname: "127.0.0.1" });
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
