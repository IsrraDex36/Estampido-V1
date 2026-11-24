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
  | { kind: "processing" }
  | { kind: "done"; result: ConvertResponse }
  | { kind: "error"; message: string };
