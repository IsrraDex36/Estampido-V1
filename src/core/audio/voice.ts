/**
 * Voice effects for the sticker's sound (ffmpeg audio filters, 48 kHz).
 * Pitch shifts change the sample rate and then re-time the sound, so the
 * sound keeps its length (and stays in sync with the picture).
 */
export const VOICE_EFFECTS = ["ardilla", "monstruo", "robot", "radio", "alien", "cueva", "eco", "reversa"] as const;
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
    case "robot":
      // Zero the phase of every FFT bin: the classic flat, metallic «robotize».
      return ["afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"];
    case "radio":
      // Telephone / walkie-talkie band + squashed dynamics.
      return ["highpass=f=400", "lowpass=f=3200", "acompressor=threshold=0.1:ratio=6:makeup=2"];
    case "alien":
      return ["vibrato=f=7:d=0.6", "aphaser=type=t:speed=2"];
    case "cueva":
      // Dense, decaying reflections: a big room / cave.
      return ["aecho=0.8:0.9:60|120|240|480:0.5|0.4|0.3|0.2"];
    case "eco":
      return ["aecho=0.8:0.85:120|260:0.45|0.25"];
    case "reversa":
      return ["areverse"];
    default:
      return [];
  }
}
