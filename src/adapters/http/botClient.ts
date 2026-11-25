import { readFile } from "node:fs/promises";
import { controlFile } from "../../config/paths.js";

/** Talks to the bot's localhost control endpoint (see adapters/bot/control.ts). */
export interface BotClient {
  status(): Promise<{ available: boolean; connected: boolean }>;
  sendToSelf(req: {
    webpPath: string;
    audioPath?: string;
    audioDurationSec?: number;
    animated: boolean;
  }): Promise<{ delivered: "native" | "sticker" }>;
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

  return {
    async status() {
      try {
        const res = await call("/status", { signal: AbortSignal.timeout(2_000) });
        if (!res.ok) return { available: false, connected: false };
        const { connected } = (await res.json()) as { connected: boolean };
        return { available: true, connected };
      } catch {
        return { available: false, connected: false };
      }
    },
    async sendToSelf(req) {
      const res = await call("/send-self", { method: "POST", body: JSON.stringify(req) });
      const body = (await res.json().catch(() => ({}))) as { delivered?: "native" | "sticker"; error?: string };
      if (res.status === 503) throw new BotUnavailableError(body.error ?? "El bot no está conectado a WhatsApp.");
      if (!res.ok || !body.delivered) throw new Error(body.error ?? `bot ${res.status}`);
      return { delivered: body.delivered };
    },
  };
}
