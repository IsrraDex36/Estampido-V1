import { readFile } from "node:fs/promises";
import { controlFile } from "../../config/paths.js";

/** Talks to the bot's localhost control endpoint (see adapters/bot/control.ts). */
export interface SendRequest {
  /** SHA-256 of the browser id (see CLIENT_HEADER). */
  client: string;
  webpPath: string;
  audioPath?: string;
  audioDurationSec?: number;
  animated: boolean;
}

export type BotLinkStatus =
  | { state: "unlinked" }
  | { state: "pending"; code: string; expiresAt: number }
  | { state: "linked"; phone: string; linkedAt: number };

export interface BotClient {
  status(): Promise<{ available: boolean; connected: boolean; botNumber?: string | null }>;
  createLink(client: string): Promise<{ code: string; expiresAt: number }>;
  linkStatus(client: string): Promise<BotLinkStatus>;
  unlink(client: string): Promise<void>;
  send(req: SendRequest): Promise<{ delivered: "native" | "sticker" }>;
}

/** The bot answered with a known, user-facing failure (not linked, too fast…). */
export class BotRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BotRequestError";
  }
}

export class BotUnavailableError extends Error {
  constructor(message = "El bot de WhatsApp no está corriendo. Arráncalo con `npm run bot`.") {
    super(message);
    this.name = "BotUnavailableError";
  }
}

async function readControl(file: string): Promise<{ port: number; token: string } | null> {
  try {
    const { port, token } = JSON.parse(await readFile(file, "utf8"));
    return typeof port === "number" && typeof token === "string" ? { port, token } : null;
  } catch {
    return null;
  }
}

export function createBotClient(file: string = controlFile(), timeoutMs = 60_000): BotClient {
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const ctl = await readControl(file);
    if (!ctl) throw new BotUnavailableError();
    try {
      return await fetch(`http://127.0.0.1:${ctl.port}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${ctl.token}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new BotUnavailableError();
    }
  }

  async function json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (res.status === 503) throw new BotUnavailableError(body.error ?? "El bot no está conectado a WhatsApp.");
    if (!res.ok) throw new BotRequestError(body.error ?? `bot ${res.status}`, body.code ?? "bot_error", res.status);
    return body;
  }

  return {
    async status() {
      try {
        const res = await call("/status", { signal: AbortSignal.timeout(2_000) });
        if (!res.ok) return { available: false, connected: false };
        const { connected, botNumber } = (await res.json()) as { connected: boolean; botNumber?: string | null };
        return { available: true, connected, botNumber: botNumber ?? null };
      } catch {
        return { available: false, connected: false };
      }
    },
    async createLink(client) {
      return json(await call("/links", { method: "POST", body: JSON.stringify({ client }) }));
    },
    async linkStatus(client) {
      return json(await call(`/links/${client}`));
    },
    async unlink(client) {
      await json(await call(`/links/${client}`, { method: "DELETE" }));
    },
    async send(req) {
      const body = await json<{ delivered?: "native" | "sticker" }>(
        await call("/send", { method: "POST", body: JSON.stringify(req) }),
      );
      if (!body.delivered) throw new BotRequestError("Respuesta inválida del bot.", "bot_error", 502);
      return { delivered: body.delivered };
    },
  };
}
