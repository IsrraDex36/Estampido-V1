import { API_LIMITS } from "@contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, convertVideo } from "@/lib/api";
import type { ConverterOptions, ConverterStatus } from "../types";

const DEFAULT_OPTIONS: ConverterOptions = {
  startSec: 0,
  durationSec: 5,
  fit: "pad",
  includeAudio: true,
  audioStartSec: 0,
};

/** Client-side checks before upload; returns an error message or null. */
export function validateFile(file: File): string | null {
  if (!file.type.startsWith("video/")) return "El archivo no es un video.";
  if (file.size > API_LIMITS.maxUploadBytes) {
    return `El video supera ${API_LIMITS.maxUploadBytes / 1024 / 1024} MB.`;
  }
  return null;
}

/** Replacement sound: any audio, or a video whose sound we reuse. */
export function validateAudioFile(file: File): string | null {
  if (!/^(audio|video)\//.test(file.type)) return "El archivo de sonido debe ser audio o video.";
  if (file.size > API_LIMITS.maxAudioBytes) return `El audio supera ${API_LIMITS.maxAudioBytes / 1024 / 1024} MB.`;
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
  const [audioFile, setAudioFile] = useState<File | null>(null);
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

  /** Set/clear the replacement sound. Returns an error message or null. */
  const selectAudioFile = useCallback((next: File | null): string | null => {
    if (next) {
      const error = validateAudioFile(next);
      if (error) return error;
    }
    setAudioFile(next);
    setOptions((o) => ({ ...o, audioStartSec: 0 }));
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
      const result = await convertVideo({ video: file, audio: audioFile }, options, {
        signal: controller.signal,
        onUploadProgress: (progress) => setStatus({ kind: "uploading", progress }),
        onProcessing: () => setStatus({ kind: "processing" }),
      });
      setStatus({ kind: "done", result });
    } catch (err) {
      if (err instanceof ApiError && err.code === "aborted") return;
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Error desconocido." });
    }
  }, [file, audioFile, options]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus({ kind: file ? "ready" : "idle" });
  }, [file]);

  const busy = status.kind === "uploading" || status.kind === "processing";

  return {
    file,
    previewUrl,
    audioFile,
    options,
    status,
    busy,
    selectFile,
    selectAudioFile,
    updateOptions,
    convert,
    cancel,
  };
}
