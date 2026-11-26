import type {
  ApiErrorBody,
  ConvertRequestFields,
  ConvertJobAccepted,
  ConvertJobStatus,
  ConvertResponse,
  ConvertSlot,
  QueueInfo,
  SendToWhatsAppResponse,
  WhatsAppLink,
  WhatsAppStatus,
} from "@contract";
import { CLIENT_HEADER, SLOT_HEADER } from "@contract";
import { getClientId } from "./clientId";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Server said when to come back (busy / one at a time). */
  readonly retryAfterSec?: number;

  constructor(message: string, code: string, status: number, retryAfterSec?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Seconds from a body's retryAfterSec or the Retry-After header. */
const retryAfterOf = (body: unknown, header: string | null): number | undefined => {
  const fromBody = (body as { error?: { retryAfterSec?: number } } | null)?.error?.retryAfterSec;
  const n = typeof fromBody === "number" ? fromBody : Number(header);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export interface ConvertCallbacks {
  /** 0–1 upload fraction. */
  onUploadProgress?: (fraction: number) => void;
  /** Waiting in line (position 1 = next). */
  onQueued?: (position: number, etaSec: number) => void;
  /** Converting now: seconds so far and typical total. */
  onProcessing?: (elapsedSec: number, expectedSec: number) => void;
  signal?: AbortSignal;
}

export interface ConvertFiles {
  /** Video, GIF or image. */
  media: File;
  /** Optional replacement sound (audio or video file). */
  audio?: File | null;
  /** Meme text layer: transparent PNG at the sticker's size. */
  overlay?: Blob | null;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ApiError("Cancelado.", "aborted", 0));
      },
      { once: true },
    );
  });

function formFor({ media, audio, overlay }: ConvertFiles, fields: ConvertRequestFields): FormData {
  const form = new FormData();
  form.set("media", media);
  if (audio && fields.includeAudio) form.set("audio", audio);
  if (overlay) form.set("overlay", overlay, "texto.png");
  if (fields.voice && fields.includeAudio) form.set("voice", fields.voice);
  form.set("startSec", String(fields.startSec));
  if (fields.durationSec !== undefined) form.set("durationSec", String(fields.durationSec));
  form.set("fit", fields.fit);
  if (fields.fit === "crop") {
    for (const key of ["cropX", "cropY", "cropZoom"] as const) {
      const v = fields[key];
      if (v !== undefined) form.set(key, String(Math.round(v * 10000) / 10000));
    }
  }
  if (fields.fit === "pad" && fields.background && fields.background !== "transparent") form.set("background", fields.background);
  form.set("includeAudio", String(fields.includeAudio));
  form.set("audioStartSec", String(fields.audioStartSec));
  if (audio && fields.audioDurationSec !== undefined) form.set("audioDurationSec", String(fields.audioDurationSec));
  form.set("includeMetadata", String(fields.includeMetadata));
  if (fields.hq) form.set("hq", "true");
  for (const key of ["packName", "publisher"] as const) {
    const v = fields[key]?.trim();
    if (v) form.set(key, v);
  }
  return form;
}

/** Upload with progress (XHR: fetch has no upload progress). Resolves the 202 body. */
function upload(form: FormData, slot: string, onProgress: ConvertCallbacks["onUploadProgress"], signal?: AbortSignal) {
  return new Promise<ConvertJobAccepted>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/convert?async=1");
    xhr.responseType = "json";
    xhr.setRequestHeader(CLIENT_HEADER, getClientId());
    xhr.setRequestHeader(SLOT_HEADER, slot);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 202) return resolve(xhr.response as ConvertJobAccepted);
      const body = xhr.response as (ApiErrorBody & { error: { retryAfterSec?: number } }) | null;
      reject(
        new ApiError(
          body?.error.message ?? `Error HTTP ${xhr.status}`,
          body?.error.code ?? "http",
          xhr.status,
          retryAfterOf(body, xhr.getResponseHeader("Retry-After")),
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError("No se pudo subir el archivo. Revisa tu conexión.", "network", 0));
    xhr.onabort = () => reject(new ApiError("Cancelado.", "aborted", 0));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Create a sticker through the server's queue:
 * 1. ask for a place in line (tiny request — a «busy» answer costs no upload);
 * 2. upload with that place (real progress);
 * 3. follow the job (position in line → converting → result), polling gently.
 * Cancelling at any step also cancels on the server (frees the place).
 */
export async function convertVideo(
  files: ConvertFiles,
  fields: ConvertRequestFields,
  { onUploadProgress, onQueued, onProcessing, signal }: ConvertCallbacks = {},
): Promise<ConvertResponse> {
  const headers = clientHeaders();
  let res: Response;
  try {
    res = await fetch("/api/convert/slot", { method: "POST", headers, signal });
  } catch (err) {
    if (signal?.aborted) throw new ApiError("Cancelado.", "aborted", 0);
    void err;
    throw new ApiError("No se pudo conectar con el servidor.", "network", 0);
  }
  const { slot } = await readJson<ConvertSlot>(res);

  const accepted = await upload(formFor(files, fields), slot, onUploadProgress, signal);
  const jobUrl = `/api/jobs/${encodeURIComponent(accepted.jobId)}`;
  const cancelOnServer = () => void fetch(jobUrl, { method: "DELETE", headers, keepalive: true }).catch(() => {});
  signal?.addEventListener("abort", cancelOnServer, { once: true });
  if (accepted.position > 0) onQueued?.(accepted.position, accepted.etaSec);
  else onProcessing?.(0, 0);

  try {
    for (let i = 0; ; i++) {
      // Quick at first, then calmer (keeps hundreds of waiting people cheap for the server).
      await sleep(i < 5 ? 700 : 1500, signal);
      let st: ConvertJobStatus;
      try {
        st = await readJson<ConvertJobStatus>(await fetch(jobUrl, { headers, signal }));
      } catch (err) {
        if (signal?.aborted) throw new ApiError("Cancelado.", "aborted", 0);
        if (err instanceof ApiError && err.status > 0) throw err; // 404 expired, etc.
        continue; // a blip in the connection: keep following
      }
      if (st.state === "queued") onQueued?.(st.position, st.etaSec);
      else if (st.state === "running") onProcessing?.(st.elapsedSec, st.expectedSec);
      else if (st.state === "done") return st.result;
      else if (st.state === "failed") throw new ApiError(st.error.message, st.error.code, st.error.status, st.error.retryAfterSec);
      else throw new ApiError("Cancelado.", "aborted", 0);
    }
  } finally {
    signal?.removeEventListener("abort", cancelOnServer);
  }
}

/** How busy the converter is (shown before creating). Never throws. */
export async function getQueueInfo(signal?: AbortSignal): Promise<QueueInfo | null> {
  try {
    return await readJson<QueueInfo>(await fetch("/api/queue", { signal }));
  } catch {
    return null;
  }
}

export const downloadUrl = (url: string): string => `${url}?download`;

export async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    throw new ApiError(
      body?.error?.message ?? `Error HTTP ${res.status}`,
      body?.error?.code ?? "http",
      res.status,
      retryAfterOf(body, res.headers.get("Retry-After")),
    );
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

/** Send a community sticker to THIS browser's linked WhatsApp chat. 409 not_linked if none. */
export async function sendCommunityToWhatsApp(stickerId: string): Promise<SendToWhatsAppResponse> {
  return readJson<SendToWhatsAppResponse>(
    await fetch(`/api/community/stickers/${encodeURIComponent(stickerId)}/whatsapp`, {
      method: "POST",
      headers: clientHeaders(),
    }),
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
