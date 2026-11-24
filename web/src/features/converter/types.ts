import type { ConvertRequestFields, ConvertResponse } from "@contract";

export type ConverterOptions = ConvertRequestFields;

/** UX state machine for one conversion. */
export type ConverterStatus =
  | { kind: "idle" }
  | { kind: "ready" }
  | { kind: "uploading"; progress: number }
  | { kind: "processing" }
  | { kind: "done"; result: ConvertResponse }
  | { kind: "error"; message: string };
