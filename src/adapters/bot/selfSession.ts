import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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
import { RateLimiter } from "../../utils/rateLimit.js";
import { formatPairingCode, normalizePairingNumber } from "./connection.js";
import { resolveWaVersion } from "./pairing.js";
import { type SoundStickerInput, sendSoundSticker } from "./soundSticker.js";

/**
 * «Tu propio WhatsApp»: each person links THEIR WhatsApp as a linked device
 * and Estampido sends the sticker to their own «Tú» chat. No shared number
 * messaging many people (the ban pattern), and no stored accounts.
 *
 * Threat model and defenses:
 * - Server breach → nothing to steal: sessions are never written here; they
 *   live sealed (AES-256-GCM) in each person's browser.
 * - Copied session (logs, screenshots, backups, a shared browser profile) →
 *   useless elsewhere: the seal authenticates the browser's id (AAD), and
 *   only this server has the key. Unused sessions expire (180 days).
 * - Mass revocation → bump SVA_SELF_EPOCH: every sealed session stops opening.
 * - Harassment with pairing codes (typing someone else's number so their
 *   phone gets «link a device» prompts) → per-number cap (hashed, in memory).
 * - Link hijack → a pending link is handed only to the browser that started it.
 * - Two tabs at once → one operation per WhatsApp account at a time (lock),
 *   so the device keys never fork.
 * - Resource abuse → few sockets at once, a bounded waiting line, a time
 *   limit on every operation, abandoned links closed by a timer.
 * - Privacy → no history sync, no init queries, no message handlers; the
 *   phone number is only used to request the code.
 */

// ── sealing ─────────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  creds: AuthenticationCreds;
  keys: Partial<Record<keyof SignalDataTypeMap, Record<string, unknown>>>;
}

const VERSION = "s2";
/** Sessions not used for this long stop opening (each send refreshes it). */
export const SESSION_MAX_AGE_MS = 180 * 24 * 60 * 60_000;

/**
 * Key for sealing sessions, derived from the server's persistent secret and
 * an epoch (SVA_SELF_EPOCH): raising the epoch revokes every session at once.
 */
export const sealKeyFrom = (secret: Buffer, epoch = "1"): Buffer =>
  createHmac("sha256", secret).update(`estampido/self-session/v2/${epoch}`).digest();

interface Sealed {
  /** Issued at (ms). */
  iat: number;
  s: SessionSnapshot;
}

/** Seal a session for ONE browser (`bind` = its client hash, authenticated as AAD). */
export function sealSession(s: SessionSnapshot, key: Buffer, bind: string, now = Date.now()): string {
  const plain = gzipSync(Buffer.from(JSON.stringify({ iat: now, s } satisfies Sealed, BufferJSON.replacer)));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${VERSION}:${bind}`));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export type SessionErrorCode =
  | "invalid"
  | "expired"
  | "logged_out"
  | "timeout"
  | "busy"
  | "send_failed"
  | "rate_limited";

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code: SessionErrorCode,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

const INVALID = () =>
  new SessionError("Tu vinculación no es válida en este navegador. Vincula tu WhatsApp otra vez.", "invalid");

export function openSession(sealed: string, key: Buffer, bind: string, now = Date.now()): SessionSnapshot {
  const [v, data] = sealed.split(".");
  if (v !== VERSION || !data || data.length > 3_000_000) throw INVALID();
  let parsed: Sealed;
  try {
    const raw = Buffer.from(data, "base64url");
    if (raw.length < 29) throw new Error("short");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${VERSION}:${bind}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = gunzipSync(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]), {
      maxOutputLength: 16 * 1024 * 1024, // a sealed session is ~10–100 KB: refuse zip bombs
    });
    parsed = JSON.parse(plain.toString("utf8"), BufferJSON.reviver) as Sealed;
  } catch {
    throw INVALID();
  }
  if (typeof parsed?.iat !== "number" || !parsed.s?.creds) throw INVALID();
  if (now - parsed.iat > SESSION_MAX_AGE_MS) {
    throw new SessionError("Tu vinculación venció por falta de uso. Vincula tu WhatsApp otra vez.", "expired");
  }
  return parsed.s;
}

// ── in-memory auth state ────────────────────────────────────────────────────

/** Baileys auth state backed by a plain object (no files). `snapshot()` gives what to seal. */
export function memoryAuthState(from?: SessionSnapshot): {
  state: AuthenticationState;
  snapshot: () => SessionSnapshot;
} {
  const creds = from?.creds ?? initAuthCreds();
  // Deep copy that keeps Node Buffers as Buffers (structuredClone turns them into plain
  // Uint8Arrays, and the Signal code calls Buffer methods on keys).
  const keys: SessionSnapshot["keys"] = JSON.parse(
    JSON.stringify(from?.keys ?? {}, BufferJSON.replacer),
    BufferJSON.reviver,
  );
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

/** The part of a Baileys socket we use (lets tests drive the whole flow with a fake). */
export type SelfSocket = Pick<WASocket, "ev" | "end" | "logout" | "requestPairingCode" | "sendMessage"> & {
  user?: WASocket["user"];
};

export type SocketFactory = (state: AuthenticationState) => Promise<SelfSocket>;

const quiet = pino({ level: "silent" });

/** A socket that never asks for history nor handles messages (we only send to ourselves). */
export const realSocket: SocketFactory = async (state) => {
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
};

type ConnUpdate = { connection?: string; qr?: string; lastDisconnect?: { error?: unknown } };
const statusOf = (u: ConnUpdate) =>
  (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;

/**
 * After «open», WhatsApp still delivers what's pending (pre-key checks, offline
 * notifications). Leaving before that can leave the device half-registered:
 * wait for it (bounded), then a short quiet period.
 */
function untilSettled(sock: SelfSocket, maxMs: number, quietMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(cap);
      setTimeout(resolve, quietMs);
    };
    const cap = setTimeout(finish, maxMs);
    sock.ev.on("connection.update", (u: ConnUpdate & { receivedPendingNotifications?: boolean }) => {
      if (u.receivedPendingNotifications) finish();
    });
  });
}

/** Safe diagnostics: only the disconnect code (never numbers, keys or sessions). */
const logClose = (where: string, u: ConnUpdate) => {
  const code = statusOf(u);
  if (code !== undefined && code !== DisconnectReason.restartRequired)
    console.warn(`[self] ${where}: WhatsApp cerró con código ${code}`);
};

/**
 * A finished pairing. NOT `creds.registered`: Baileys sets that only on the
 * pairing-CODE path; QR pairings never set it (that check made every QR-linked
 * session look invalid → «vinculado» but every send asked to link again).
 * What both paths do set at pair-success: our own jid and the signed device
 * identity (`account`) WhatsApp issued to this device.
 */
export function isPaired(creds: Partial<AuthenticationCreds>): boolean {
  return Boolean(creds.me?.id && creds.account);
}

/** Resolves when the socket is open; rejects on logout/close/timeout. */
function untilOpen(sock: SelfSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new SessionError("Tu WhatsApp no respondió a tiempo. Intenta otra vez.", "timeout")),
      timeoutMs,
    );
    sock.ev.on("connection.update", (u: ConnUpdate) => {
      if (u.connection === "open") {
        clearTimeout(t);
        resolve();
      } else if (u.connection === "close") {
        clearTimeout(t);
        logClose("envío", u);
        reject(
          statusOf(u) === DisconnectReason.loggedOut
            ? new SessionError("Tu WhatsApp quitó este dispositivo: vincúlalo otra vez.", "logged_out")
            : new SessionError("No se pudo conectar con tu WhatsApp. Intenta otra vez.", "timeout"),
        );
      }
    });
  });
}

/** Reject after `ms` (the operation keeps running but its socket is closed by the caller). */
const within = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new SessionError(`${what} tardó demasiado.`, "timeout")), ms).unref?.(),
    ),
  ]);

/**
 * Bounded concurrency with a bounded waiting line. A waiter that gives up is
 * removed from the line (a dead entry must never swallow a free slot).
 */
export class Gate {
  private active = 0;
  private readonly line: { go: () => void }[] = [];
  constructor(
    private readonly max: number,
    private readonly maxWaiting = 20,
  ) {}

  get busy(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.line.length };
  }

  async run<T>(fn: () => Promise<T>, waitMs = 30_000): Promise<T> {
    if (this.active >= this.max) {
      if (this.line.length >= this.maxWaiting)
        throw new SessionError("Mucha gente enviando: intenta en unos segundos.", "busy");
      await new Promise<void>((resolve, reject) => {
        const entry = {
          go: () => {
            clearTimeout(t);
            resolve();
          },
        };
        const t = setTimeout(() => {
          const i = this.line.indexOf(entry);
          if (i >= 0) this.line.splice(i, 1);
          reject(new SessionError("Mucha gente enviando: intenta en unos segundos.", "busy"));
        }, waitMs);
        this.line.push(entry);
      });
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.line.shift()?.go();
    }
  }
}

/** One operation per key at a time (same WhatsApp from two tabs → in order, never in parallel). */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const mine = prev.then(fn, fn);
    const tail = mine.catch(() => {});
    this.tails.set(key, tail);
    try {
      return await mine;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
  get size(): number {
    return this.tails.size;
  }
}

export interface SelfItem extends Partial<SoundStickerInput> {
  webpPath: string;
  animated: boolean;
}

export interface SelfSessionsOptions {
  sealKey: Buffer;
  maxConcurrent?: number;
  maxWaiting?: number;
  openTimeoutMs?: number;
  /** Whole operation (connect + send N + close). */
  opTimeoutMs?: number;
  /** Pairing-code requests per phone number per hour (anti-harassment). */
  codesPerNumberPerHour?: number;
  /** Pending links at once. */
  maxPendingLinks?: number;
  linkTtlMs?: number;
  /** Pauses (tests use 0). */
  settleMs?: number;
  /** Max wait for WhatsApp's first-login tasks after linking / before sending. */
  linkSettleMaxMs?: number;
  sendSettleMaxMs?: number;
  gapMs?: number;
  socket?: SocketFactory;
  sendSticker?: (sock: SelfSocket, jid: string, item: SelfItem) => Promise<void>;
  now?: () => number;
}

type LinkState =
  | { state: "waiting" }
  | { state: "qr"; qr: string }
  | { state: "code"; code: string }
  /** `me`: the linked WhatsApp's own jid — stays in the bot; control turns it into an opaque account key. */
  | { state: "linked"; session: string; me: string }
  | { state: "failed"; reason: string };

/** Native sound sticker when there's sound, a plain sticker otherwise. */
const defaultSend = async (sock: SelfSocket, jid: string, it: SelfItem) => {
  if (it.audioPath && it.audioDurationSec) {
    await sendSoundSticker(sock as WASocket, jid, {
      webpPath: it.webpPath,
      audioPath: it.audioPath,
      audioDurationSec: it.audioDurationSec,
      animated: it.animated,
    });
  } else {
    await sock.sendMessage(jid, { sticker: { url: it.webpPath } });
  }
};

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const phoneKey = (digits: string) => createHash("sha256").update(`estampido/phone/${digits}`).digest("hex");

export class SelfSessions {
  private readonly gate: Gate;
  private readonly lock = new KeyedLock();
  private readonly codes: RateLimiter;
  private readonly links = new Map<
    string,
    { client: string; status: LinkState; end: () => void; timer: NodeJS.Timeout }
  >();
  private readonly o: Required<Omit<SelfSessionsOptions, "socket" | "sendSticker" | "now">> & {
    socket: SocketFactory;
    sendSticker: NonNullable<SelfSessionsOptions["sendSticker"]>;
    now: () => number;
  };

  constructor(opts: SelfSessionsOptions) {
    this.o = {
      maxConcurrent: 4,
      maxWaiting: 20,
      openTimeoutMs: 25_000,
      opTimeoutMs: 120_000,
      codesPerNumberPerHour: 3,
      maxPendingLinks: 30,
      linkTtlMs: 4 * 60_000,
      settleMs: 1_200,
      linkSettleMaxMs: 20_000,
      sendSettleMaxMs: 8_000,
      gapMs: 400,
      socket: realSocket,
      sendSticker: defaultSend,
      now: Date.now,
      ...opts,
    };
    this.gate = new Gate(this.o.maxConcurrent, this.o.maxWaiting);
    this.codes = new RateLimiter(this.o.codesPerNumberPerHour, 60 * 60_000);
  }

  get pendingLinks(): number {
    return this.links.size;
  }

  // ── linking ───────────────────────────────────────────────────────────────

  /** A fresh in-memory session; the phone types a code (phone given) or scans a QR. Bound to `client`. */
  async startLink(client: string, phone?: string): Promise<string> {
    if (this.links.size >= this.o.maxPendingLinks) {
      throw new SessionError("Mucha gente vinculando: intenta en un momento.", "busy");
    }
    const number = phone ? normalizePairingNumber(phone) : null;
    if (phone && !number) throw new SessionError("Escribe tu número con código de país (ej. 52 229 …).", "invalid");
    if (number && this.codes.take(phoneKey(number), this.o.now()) > 0) {
      throw new SessionError("Ya pedimos varios códigos para ese número. Intenta en una hora.", "rate_limited");
    }
    const id = randomUUID();
    const { state, snapshot } = memoryAuthState();
    let sock: SelfSocket | null = null;
    const end = () => {
      try {
        sock?.end(undefined);
      } catch {
        // already closed
      }
    };
    const timer = setTimeout(() => this.dropLink(id), this.o.linkTtlMs);
    timer.unref?.();
    const entry = { client, status: { state: "waiting" } as LinkState, end, timer };
    this.links.set(id, entry);

    let asked = false;
    let finished = false;
    const run = async (): Promise<void> => {
      sock = await this.o.socket(state);
      const s = sock;
      s.ev.on("connection.update", async (u: ConnUpdate) => {
        if (finished) return;
        if (u.qr && !state.creds.registered) {
          if (number && !asked) {
            asked = true;
            try {
              entry.status = { state: "code", code: formatPairingCode(await s.requestPairingCode(number)) };
            } catch {
              entry.status = { state: "failed", reason: "No se pudo pedir el código. Intenta con el QR." };
            }
          } else if (!number) entry.status = { state: "qr", qr: u.qr };
        }
        if (u.connection === "open") {
          finished = true;
          // Stay until WhatsApp finished the first login (pre-keys, pending notifications).
          await untilSettled(s, this.o.linkSettleMaxMs, this.o.settleMs * 2);
          const snap = snapshot();
          if (!isPaired(snap.creds)) {
            // Never tell the browser «linked» with a session that can't be used.
            console.warn("[self] vinculación: conexión abierta sin identidad de dispositivo");
            entry.status = { state: "failed", reason: "WhatsApp no terminó de vincular. Intenta otra vez." };
            end();
            return;
          }
          entry.status = {
            state: "linked",
            session: sealSession(snap, this.o.sealKey, client, this.o.now()),
            me: jidNormalizedUser(snap.creds.me?.id ?? s.user?.id ?? ""),
          };
          end();
        } else if (u.connection === "close") {
          logClose("vinculación", u);
          // Right after scanning, WhatsApp asks for a reconnect with the new credentials.
          try {
            s.end(undefined); // never leave the old socket behind
          } catch {
            // already closed
          }
          if (statusOf(u) === DisconnectReason.restartRequired) void run().catch(() => this.fail(id));
          else this.fail(id, statusOf(u));
        }
      });
    };
    try {
      await run();
    } catch {
      this.dropLink(id);
      throw new SessionError("No se pudo empezar la vinculación. Intenta otra vez.", "timeout");
    }
    return id;
  }

  private fail(id: string, code?: number): void {
    const e = this.links.get(id);
    if (!e || e.status.state === "linked") return;
    const reason =
      code === DisconnectReason.timedOut
        ? "El código venció antes de escribirlo en WhatsApp (dura unos 2 minutos). Pide otro y escríbelo enseguida."
        : code === DisconnectReason.forbidden
          ? "WhatsApp no permitió vincular este número ahora. Intenta más tarde."
          : "La vinculación no se completó. Intenta otra vez.";
    e.status = { state: "failed", reason };
  }

  private dropLink(id: string): void {
    const e = this.links.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    e.end();
    this.links.delete(id);
  }

  /** Status for the browser that started it (anyone else: null). Final states are handed out once. */
  linkStatus(id: string, client: string): LinkState | null {
    const e = this.links.get(id);
    if (!e || e.client !== client) return null;
    if (e.status.state === "linked" || e.status.state === "failed") this.dropLink(id);
    return e.status;
  }

  // ── using a session ───────────────────────────────────────────────────────

  /**
   * Who this sealed session belongs to — WITHOUT connecting to WhatsApp (just
   * unsealing). Owning a session sealed for this browser is the proof: that's
   * how a linked browser signs in again after its cookie is gone.
   */
  whoAmI(sealed: string, client: string): string {
    const snap = openSession(sealed, this.o.sealKey, client, this.o.now());
    if (!isPaired(snap.creds)) throw INVALID();
    return jidNormalizedUser(snap.creds.me?.id ?? "");
  }

  /** Open the person's session in memory, run `fn`, close; returns the refreshed sealed session. */
  private async withSession<T>(
    sealed: string,
    client: string,
    fn: (sock: SelfSocket, self: string) => Promise<T>,
  ): Promise<{ result: T; session: string }> {
    const snap = openSession(sealed, this.o.sealKey, client, this.o.now()); // invalid/expired: fail fast, no socket
    if (!isPaired(snap.creds)) throw INVALID();
    const account = jidNormalizedUser(snap.creds.me?.id ?? "");
    return this.lock.run(account, () =>
      this.gate.run(async () => {
        const { state, snapshot } = memoryAuthState(snap);
        const sock = await this.o.socket(state);
        try {
          return await within(
            (async () => {
              const settled = untilSettled(sock, this.o.sendSettleMaxMs, 0);
              await untilOpen(sock, this.o.openTimeoutMs);
              await settled; // pending notifications first: a healthy session before sending
              const self = jidNormalizedUser(sock.user?.id ?? account);
              const result = await fn(sock, self);
              await sleep(this.o.settleMs); // receipts/key updates land before sealing
              return { result, session: sealSession(snapshot(), this.o.sealKey, client, this.o.now()) };
            })(),
            this.o.opTimeoutMs,
            "El envío",
          );
        } finally {
          try {
            sock.end(undefined);
          } catch {
            // already closed
          }
        }
      }),
    );
  }

  /** Send stickers to the person's OWN chat (never anyone else), in one connection. */
  sendToSelf(
    sealed: string,
    client: string,
    items: SelfItem[],
  ): Promise<{ result: { sent: number }; session: string }> {
    if (items.length === 0 || items.length > 30)
      return Promise.reject(new SessionError("Elige de 1 a 30 stickers.", "invalid"));
    return this.withSession(sealed, client, async (sock, self) => {
      let sent = 0;
      for (const [i, it] of items.entries()) {
        try {
          await this.o.sendSticker(sock, self, it);
          sent++;
        } catch {
          // keep going with the rest
        }
        if (i < items.length - 1) await sleep(this.o.gapMs);
      }
      if (sent === 0) throw new SessionError("No se pudo enviar a tu chat.", "send_failed");
      return { sent };
    });
  }

  /** Remove this device from the person's WhatsApp. */
  async logout(sealed: string, client: string): Promise<void> {
    await this.withSession(sealed, client, async (sock) => {
      await sock.logout("Estampido: desvinculado por el usuario").catch(() => {});
    }).catch((err) => {
      // Already gone from the phone: nothing left to undo.
      if (!(err instanceof SessionError && err.code === "logged_out")) throw err;
    });
  }
}
