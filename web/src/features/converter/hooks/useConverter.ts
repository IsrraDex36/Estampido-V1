import { API_LIMITS } from "@contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, convertVideo } from "@/lib/api";
import type { ConverterOptions, ConverterStatus } from "../types";

const DEFAULT_OPTIONS: ConverterOptions = {
  startSec: 0,
  durationSec: 5,
  fit: "pad",
  includeAudio: true,
};

/** Client-side checks before upload; returns an error message or null. */
export function validateFile(file: File): string | null {
  if (!file.type.startsWith("video/")) return "El archivo no es un video.";
  if (file.size > API_LIMITS.maxUploadBytes) {
    return `El video supera ${API_LIMITS.maxUploadBytes / 1024 / 1024} MB.`;
  }
  return null;
}

/**
 * Owns all converter logic: selected file, options, preview URL and the
 * upload/processing state machine. Components stay presentational.
 */
export function useConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<ConverterOptions>(DEFAULT_OPTIONS);
  const [status, setStatus] = useState<ConverterStatus>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  // Revoke object URLs to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectFile = useCallback((next: File | null): string | null => {
    abortRef.current?.abort();
    if (!next) {
      setFile(null);
      setPreviewUrl(null);
      setStatus({ kind: "idle" });
      return null;
    }
    const error = validateFile(next);
    if (error) {
      setStatus({ kind: "error", message: error });
      return error;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setOptions((o) => ({ ...o, startSec: 0 }));
    setStatus({ kind: "ready" });
    return null;
  }, []);

  const updateOptions = useCallback((patch: Partial<ConverterOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
  }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus({ kind: "uploading", progress: 0 });
    try {
      const result = await convertVideo(file, options, {
        signal: controller.signal,
        onUploadProgress: (progress) => setStatus({ kind: "uploading", progress }),
        onProcessing: () => setStatus({ kind: "processing" }),
      });
      setStatus({ kind: "done", result });
    } catch (err) {
      if (err instanceof ApiError && err.code === "aborted") return;
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Error desconocido." });
    }
  }, [file, options]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus({ kind: file ? "ready" : "idle" });
  }, [file]);

  const busy = status.kind === "uploading" || status.kind === "processing";

  return { file, previewUrl, options, status, busy, selectFile, updateOptions, convert, cancel };
}
