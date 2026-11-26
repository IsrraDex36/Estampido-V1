import type { ConvertRequestFields, ConvertResponse } from "@contract";

export type ConverterOptions = ConvertRequestFields;

/**
 * Client-side guess from MIME, for UI only (the server probes the real kind;
 * e.g. a .webp may turn out animated).
 */
export type InputKind = "video" | "gif" | "image";

export function inputKindOf(file: File): InputKind {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("image/")) return "image";
  return "video";
}

/** UX state machine for one conversion. */
export type ConverterStatus =
  | { kind: "idle" }
  | { kind: "ready" }
  | { kind: "uploading"; progress: number }
  /** Waiting in the server's line. */
  | { kind: "queued"; position: number; etaSec: number }
  /** Converting: seconds so far / typical total (0 = unknown yet). */
  | { kind: "processing"; elapsedSec?: number; expectedSec?: number }
  | { kind: "done"; result: ConvertResponse }
  | { kind: "error"; error: ConvertFailure };

/** A failed conversion, with what the card needs to explain it. */
export interface ConvertFailure {
  message: string;
  /** API error code (busy, timeout, too_large…) or local (network, invalid). */
  code: string;
  /** HTTP status (0 = no response). */
  status: number;
  retryAfterSec?: number;
}
