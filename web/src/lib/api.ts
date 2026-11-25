import type {
  ApiErrorBody,
  ConvertRequestFields,
  ConvertResponse,
  SendToWhatsAppResponse,
  WhatsAppLink,
  WhatsAppStatus,
} from "@contract";
import { CLIENT_HEADER } from "@contract";
import { getClientId } from "./clientId";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ConvertCallbacks {
  /** 0–1 upload fraction. */
  onUploadProgress?: (fraction: number) => void;
  /** Fired once the upload finishes and the server starts processing. */
  onProcessing?: () => void;
  signal?: AbortSignal;
}

export interface ConvertFiles {
  /** Video, GIF or image. */
  media: File;
  /** Optional replacement sound (audio or video file). */
  audio?: File | null;
}

/**
 * POST /api/convert. Uses XHR (not fetch) because fetch has no upload progress.
 */
export function convertVideo(
  { media, audio }: ConvertFiles,
  fields: ConvertRequestFields,
  { onUploadProgress, onProcessing, signal }: ConvertCallbacks = {},
): Promise<ConvertResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("media", media);
    if (audio && fields.includeAudio) form.set("audio", audio);
    form.set("startSec", String(fields.startSec));
    if (fields.durationSec !== undefined) form.set("durationSec", String(fields.durationSec));
    form.set("fit", fields.fit);
    if (fields.fit === "pad" && fields.background && fields.background !== "transparent") form.set("background", fields.background);
    form.set("includeAudio", String(fields.includeAudio));
    form.set("audioStartSec", String(fields.audioStartSec));
    form.set("includeMetadata", String(fields.includeMetadata));
    if (fields.hq) form.set("hq", "true");
    for (const key of ["packName", "publisher"] as const) {
      const v = fields[key]?.trim();
      if (v) form.set(key, v);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/convert");
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => onProcessing?.();

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as ConvertResponse);
      const body = xhr.response as ApiErrorBody | null;
      reject(new ApiError(body?.error.message ?? `Error HTTP ${xhr.status}`, body?.error.code ?? "http", xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("No se pudo conectar con el servidor.", "network", 0));
    xhr.onabort = () => reject(new ApiError("Cancelado.", "aborted", 0));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export const downloadUrl = (url: string): string => `${url}?download`;

export async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    throw new ApiError(body?.error?.message ?? `Error HTTP ${res.status}`, body?.error?.code ?? "http", res.status);
  }
  return body;
}

/** Is the WhatsApp bot running and connected? */
export async function getWhatsAppStatus(signal?: AbortSignal): Promise<WhatsAppStatus> {
  try {
    return await readJson<WhatsAppStatus>(await fetch("/api/whatsapp/status", { signal }));
  } catch (err) {
    if (signal?.aborted) throw err;
    return { available: false, connected: false };
  }
}

/** Identifies this browser to the API (hashed server-side). */
export const clientHeaders = () => ({ [CLIENT_HEADER]: getClientId() });

/** Send a result to THIS browser's linked WhatsApp chat (native sound sticker). 409 not_linked if none. */
export async function sendToWhatsApp(resultId: string): Promise<SendToWhatsAppResponse> {
  return readJson<SendToWhatsAppResponse>(
    await fetch(`/api/results/${encodeURIComponent(resultId)}/whatsapp`, { method: "POST", headers: clientHeaders() }),
  );
}

export async function getWhatsAppLink(signal?: AbortSignal): Promise<WhatsAppLink> {
  return readJson<WhatsAppLink>(await fetch("/api/whatsapp/link", { headers: clientHeaders(), signal }));
}

export async function createWhatsAppLink(): Promise<WhatsAppLink> {
  return readJson<WhatsAppLink>(await fetch("/api/whatsapp/link", { method: "POST", headers: clientHeaders() }));
}

export async function deleteWhatsAppLink(): Promise<WhatsAppLink> {
  return readJson<WhatsAppLink>(await fetch("/api/whatsapp/link", { method: "DELETE", headers: clientHeaders() }));
}
