import type { ApiErrorBody, ConvertRequestFields, ConvertResponse } from "@contract";

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
  video: File;
  /** Optional replacement sound (audio or video file). */
  audio?: File | null;
}

/**
 * POST /api/convert. Uses XHR (not fetch) because fetch has no upload progress.
 */
export function convertVideo(
  { video, audio }: ConvertFiles,
  fields: ConvertRequestFields,
  { onUploadProgress, onProcessing, signal }: ConvertCallbacks = {},
): Promise<ConvertResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("video", video);
    if (audio && fields.includeAudio) form.set("audio", audio);
    form.set("startSec", String(fields.startSec));
    form.set("durationSec", String(fields.durationSec));
    form.set("fit", fields.fit);
    form.set("includeAudio", String(fields.includeAudio));
    form.set("audioStartSec", String(fields.audioStartSec));
    form.set("includeMetadata", String(fields.includeMetadata));
    for (const key of ["packName", "publisher", "emojis"] as const) {
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
