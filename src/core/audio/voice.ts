/**
 * Voice effects for the sticker's sound (ffmpeg audio filters, 48 kHz).
 * Pitch shifts change the sample rate and then re-time the sound, so the
 * sound keeps its length (and stays in sync with the picture).
 */
export const VOICE_EFFECTS = ["ardilla", "monstruo", "eco", "reversa"] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

const RATE = 48_000;
const pitch = (factor: number): string[] => [
  `aresample=${RATE}`,
  `asetrate=${Math.round(RATE * factor)}`,
  `aresample=${RATE}`,
  `atempo=${(1 / factor).toFixed(4)}`,
];

/** The filters for an effect (empty for none). Pure. */
export function voiceFilters(effect: VoiceEffect | undefined): string[] {
  switch (effect) {
    case "ardilla":
      return pitch(1.5);
    case "monstruo":
      return pitch(0.7);
    case "eco":
      return ["aecho=0.8:0.85:120|260:0.45|0.25"];
    case "reversa":
      return ["areverse"];
    default:
      return [];
  }
}
