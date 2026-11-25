import type { ConverterOptions, InputKind } from "../types";

export const DEFAULT_OPTIONS: ConverterOptions = {
  startSec: 0,
  durationSec: 5,
  fit: "pad",
  background: "transparent",
  includeAudio: true,
  audioStartSec: 0,
  hq: false,
  includeMetadata: true,
  packName: "",
  publisher: "",
};

/** Images default to "the sound's own length"; videos/GIFs to 5 s. Pure. */
export const defaultDurationFor = (kind: InputKind, current: number | undefined): number | undefined =>
  kind === "image" ? undefined : (current ?? 5);
