import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import makeWASocket, {
  type AuthenticationCreds,
  type AuthenticationState,
  Browsers,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  jidNormalizedUser,
  type SignalDataTypeMap,
  type WASocket,
} from "baileys";
import pino from "pino";
import { formatPairingCode, normalizePairingNumber } from "./connection.js";
import { resolveWaVersion } from "./pairing.js";
import { type SoundStickerInput, sendSoundSticker } from "./soundSticker.js";

/**
 * «Tu propio WhatsApp»: each person links THEIR WhatsApp as a linked device
 * and Estampido sends the sticker to their own «Tú» chat. No shared number
 * messaging many people (the ban pattern), and no stored accounts:
 *
 * - The session (WhatsApp keys) lives ONLY in the person's browser, sealed
 *   (AES-256-GCM) with a key only this server has. Neither half works alone:
 *   a stolen browser copy is useless outside this server; a server breach
 *   finds no sessions at all (nothing is written to disk).
 * - Connections are ephemeral: open in memory → send to self → close, and
 *   the updated sealed session goes back to the browser.
 * - Nothing is read or kept: no history sync, no message handlers, the
 *   phone number is used only to request the pairing code.
 */

// ── sealing ─────────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  creds: AuthenticationCreds;
  keys: Partial<Record<keyof SignalDataTypeMap, Record<string, unknown>>>;
}

const VERSION = "s1";

/** Key for sealing sessions, derived from the server's persistent secret (never leaves the server). */
export const sealKeyFrom = (secret: Buffer): Buffer =>
  createHmac("sha256", secret).update("estampido/self-session/v1").digest();

export function sealSession(s: SessionSnapshot, key: Buffer): string {
  const plain = gzipSync(Buffer.from(JSON.stringify(s, BufferJSON.replacer)));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "logged_out" | "timeout" | "busy" | "send_failed",
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export function openSession(sealed: string, key: Buffer): SessionSnapshot {
  const [v, data] = sealed.split(".");
  if (v !== VERSION || !data) throw new SessionError("Sesión no válida.", "invalid");
  try {
    const raw = Buffer.from(data, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = gunzipSync(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]));
    return JSON.parse(plain.toString("utf8"), BufferJSON.reviver) as SessionSnapshot;
  } catch {
    throw new SessionError("Sesión no válida.", "invalid");
  }
}

// ── in-memory auth state ────────────────────────────────────────────────────

/** Baileys auth state backed by a plain object (no files). `snapshot()` gives what to seal. */
export function memoryAuthState(from?: SessionSnapshot): {
  state: AuthenticationState;
  snapshot: () => SessionSnapshot;
} {
  const creds = from?.creds ?? initAuthCreds();
  const keys: SessionSnapshot["keys"] = structuredClone(from?.keys ?? {});
  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const bucket = (keys[type] ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const id of ids) if (bucket[id] !== undefined) out[id] = bucket[id];
        return out as never;
      },
      set: async (data) => {
        for (const [type, values] of Object.entries(data)) {
          const t = type as keyof SignalDataTypeMap;
          if (!keys[t]) keys[t] = {};
          const bucket = keys[t] as Record<string, unknown>;
          for (const [id, value] of Object.entries(values ?? {})) {
            if (value === null || value === undefined) delete bucket[id];
            else bucket[id] = value;
          }
        }
      },
    },
  };
  return { state, snapshot: () => ({ creds: state.creds, keys }) };
}

// ── sockets ─────────────────────────────────────────────────────────────────

const quiet = pino({ level: "silent" });

/** A socket that never asks for history nor handles messages (we only send to ourselves). */
async function openSocket(state: AuthenticationState): Promise<WASocket> {
  const { version } = await resolveWaVersion();
  return makeWASocket({
    auth: state,
    version,
    browser: Browsers.macOS("Estampido"),
    logger: quiet,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: false,
    emitOwnEvents: false,
    getMessage: async () => undefined,
  });
}

/** Resolves when the socket is open; rejects on logout/close/timeout. */
function untilOpen(sock: WASocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SessionError("WhatsApp no respondió a tiempo.", "timeout")), timeoutMs);
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        clearTimeout(t);
        resolve();
      } else if (connection === "close") {
        clearTimeout(t);
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        reject(
          code === DisconnectReason.loggedOut
            ? new SessionError("Tu WhatsApp quitó este dispositivo: vincúlalo otra vez.", "logged_out")
            : new SessionError("No se pudo conectar con tu WhatsApp.", "timeout"),
        );
      }
    });
  });
}

/** Small concurrency gate: a handful of self sessions at once, the rest wait briefly. */
class Gate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>, waitMs = 30_000): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new SessionError("Mucha gente enviando: intenta en unos segundos.", "busy")),
          waitMs,
        );
        this.waiting.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface SelfItem extends Partial<SoundStickerInput> {
  webpPath: string;
  animated: boolean;
}

export interface SelfSessionsOptions {
  sealKey: Buffer;
  maxConcurrent?: number;
  openTimeoutMs?: number;
}

type LinkState =
  | { state: "waiting" }
  | { state: "qr"; qr: string }
  | { state: "code"; code: string }
  | { state: "linked"; session: string }
  | { state: "failed"; reason: string };

export class SelfSessions {
  private readonly gate: Gate;
  private readonly links = new Map<string, { status: LinkState; expires: number; end: () => void }>();

  constructor(private readonly o: SelfSessionsOptions) {
    this.gate = new Gate(o.maxConcurrent ?? 4);
  }

  // Linking: a fresh in-memory session; the phone scans a QR or types a code.
  async startLink(phone?: string): Promise<string> {
    this.sweep();
    if (this.links.size >= 30) throw new SessionError("Mucha gente vinculando: intenta en un momento.", "busy");
    const id = randomUUID();
    const number = phone ? normalizePairingNumber(phone) : null;
    if (phone && !number) throw new SessionError("Escribe tu número con código de país (ej. 52 229 …).", "invalid");
    const entry = { status: { state: "waiting" } as LinkState, expires: Date.now() + 4 * 60_000, end: () => {} };
    this.links.set(id, entry);
    const { state, snapshot } = memoryAuthState();
    let asked = false;
    let finished = false;
    const run = async (): Promise<void> => {
      const sock = await openSocket(state);
      entry.end = () => sock.end(undefined);
      sock.ev.on("creds.update", () => {}); // state is mutated in place
      sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
        if (qr && !state.creds.registered) {
          if (number && !asked) {
            asked = true;
            try {
              entry.status = { state: "code", code: formatPairingCode(await sock.requestPairingCode(number)) };
            } catch {
              entry.status = { state: "failed", reason: "No se pudo pedir el código. Intenta con el QR." };
            }
          } else if (!number) entry.status = { state: "qr", qr };
        }
        if (connection === "open") {
          finished = true;
          // Let the first key uploads settle, then hand the sealed session to the browser and leave.
          await new Promise((r) => setTimeout(r, 2_500));
          entry.status = { state: "linked", session: sealSession(snapshot(), this.o.sealKey) };
          sock.end(undefined);
        }
        if (connection === "close" && !finished) {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          // Right after scanning, WhatsApp asks for a reconnect with the new credentials.
          if (code === DisconnectReason.restartRequired) void run();
          else if (entry.status.state !== "linked") {
            entry.status = { state: "failed", reason: "La vinculación no se completó. Intenta otra vez." };
          }
        }
      });
    };
    await run();
    return id;
  }

  linkStatus(id: string): LinkState | null {
    this.sweep();
    const e = this.links.get(id);
    if (!e) return null;
    if (e.status.state === "linked" || e.status.state === "failed") this.links.delete(id); // handed out once
    return e.status;
  }

  private sweep(): void {
    const t = Date.now();
    for (const [id, e] of this.links) {
      if (e.expires < t) {
        e.end();
        this.links.delete(id);
      }
    }
  }

  /** Open the person's session in memory, run `fn`, close; returns the refreshed sealed session. */
  private withSession<T>(
    sealed: string,
    fn: (sock: WASocket, self: string) => Promise<T>,
  ): Promise<{ result: T; session: string }> {
    return this.gate.run(async () => {
      const { state, snapshot } = memoryAuthState(openSession(sealed, this.o.sealKey));
      if (!state.creds.registered || !state.creds.me) throw new SessionError("Sesión no vinculada.", "invalid");
      const sock = await openSocket(state);
      try {
        await untilOpen(sock, this.o.openTimeoutMs ?? 25_000);
        const self = jidNormalizedUser(sock.user?.id ?? state.creds.me?.id);
        const result = await fn(sock, self);
        await new Promise((r) => setTimeout(r, 1_200)); // let receipts/key updates land before sealing
        return { result, session: sealSession(snapshot(), this.o.sealKey) };
      } finally {
        sock.end(undefined);
      }
    });
  }

  /** Send stickers (with sound when given) to the person's own chat, in one connection. */
  sendToSelf(sealed: string, items: SelfItem[]): Promise<{ result: { sent: number }; session: string }> {
    return this.withSession(sealed, async (sock, self) => {
      let sent = 0;
      for (const it of items) {
        try {
          if (it.audioPath && it.audioDurationSec) {
            await sendSoundSticker(sock, self, {
              webpPath: it.webpPath,
              audioPath: it.audioPath,
              audioDurationSec: it.audioDurationSec,
              animated: it.animated,
            });
          } else {
            await sock.sendMessage(self, { sticker: { url: it.webpPath } });
          }
          sent++;
        } catch {
          // keep going with the rest
        }
        if (items.length > 1) await new Promise((r) => setTimeout(r, 400));
      }
      if (sent === 0) throw new SessionError("No se pudo enviar a tu chat.", "send_failed");
      return { sent };
    });
  }

  /** Remove this device from the person's WhatsApp. */
  async logout(sealed: string): Promise<void> {
    await this.gate.run(async () => {
      const { state } = memoryAuthState(openSession(sealed, this.o.sealKey));
      const sock = await openSocket(state);
      try {
        await untilOpen(sock, 20_000);
        await sock.logout("Estampido: desvinculado por el usuario");
      } catch {
        // already gone from the phone: nothing to do
      } finally {
        sock.end(undefined);
      }
    });
  }
}
