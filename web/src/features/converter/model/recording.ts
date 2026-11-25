import type { InputKind } from "../types";

/** Preferred recording containers, best first (Chrome/Firefox: WebM Opus; Safari: MP4/AAC). */
export const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"] as const;

/** First container the browser can record, or "" (let the browser choose). Pure. */
export function pickRecordingType(isSupported: (type: string) => boolean): string {
  return RECORDING_TYPES.find((t) => isSupported(t)) ?? "";
}

/** "Grabación 0-04.webm" style name for the recorded file. Pure. */
export function recordingFileName(seconds: number, mime: string): string {
  const s = Math.max(0, Math.round(seconds));
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  return `Grabación ${Math.floor(s / 60)}-${String(s % 60).padStart(2, "0")}.${ext}`;
}

/** Longest recording: the sound limit for this input, capped so it stays a "sticker sound". */
export const MAX_RECORDING_SEC = 30;
export const recordingLimitFor = (kind: InputKind | null, imageMaxSec: number): number =>
  kind === "image" ? imageMaxSec : MAX_RECORDING_SEC;

/** Friendly message for getUserMedia / MediaRecorder failures. Pure. */
export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Permiso de micrófono denegado. Actívalo en el navegador.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No se encontró ningún micrófono.";
  if (name === "NotReadableError") return "El micrófono está ocupado por otra app.";
  return "No se pudo grabar. Prueba con otro navegador.";
}
