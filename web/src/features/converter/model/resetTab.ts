import type { SettingsTabId } from "../store/converterStore";
import type { ConverterOptions, InputKind } from "../types";
import { DEFAULT_OPTIONS, defaultDurationFor } from "./defaults";
import { EMPTY_TEXT, type MemeText } from "./memeText";

/**
 * «Restablecer» per settings tab: what each tab owns and its defaults.
 * Pure, so the button shows only when there is something to reset and every
 * tab resets exactly its own choices (never another tab's).
 */
export interface TabState {
  options: ConverterOptions;
  text: MemeText;
  hasAudioFile: boolean;
  kind: InputKind | null;
}

export interface TabReset {
  options: Partial<ConverterOptions>;
  text?: MemeText;
  /** Drop the chosen sound file (back to the clip's own sound). */
  clearAudio?: boolean;
}

export function resetFor(tab: SettingsTabId, kind: InputKind | null): TabReset {
  switch (tab) {
    case "time":
      return { options: { startSec: 0, durationSec: kind ? defaultDurationFor(kind, undefined) : DEFAULT_OPTIONS.durationSec } };
    case "sound":
      return {
        options: { includeAudio: true, audioStartSec: 0, audioDurationSec: undefined, voice: undefined },
        clearAudio: true,
      };
    case "style":
      return {
        options: {
          fit: DEFAULT_OPTIONS.fit,
          background: DEFAULT_OPTIONS.background,
          cropX: undefined,
          cropY: undefined,
          cropZoom: undefined,
          look: undefined,
          flip: false,
          hq: false,
        },
      };
    case "text":
      return { options: {}, text: EMPTY_TEXT };
    case "pack":
      return { options: { includeMetadata: true, packName: "", publisher: "" } };
  }
}

const same = (a: unknown, b: unknown) => (a ?? undefined) === (b ?? undefined) || (a === false && b === undefined) || (a === undefined && b === false);

/** Does this tab differ from its defaults? */
export function tabChanged(tab: SettingsTabId, s: TabState): boolean {
  const r = resetFor(tab, s.kind);
  if (r.clearAudio && s.hasAudioFile) return true;
  if (r.text && JSON.stringify(r.text) !== JSON.stringify(s.text)) return true;
  return (Object.keys(r.options) as (keyof ConverterOptions)[]).some((k) => {
    const want = r.options[k];
    const have = s.options[k];
    if (k === "packName" || k === "publisher") return (have ?? "").toString().trim() !== "";
    return !same(have, want);
  });
}
