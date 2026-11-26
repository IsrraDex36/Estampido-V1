/**
 * Voice effects for the sticker's sound (ffmpeg audio filters, 48 kHz).
 * Pitch shifts change the sample rate and then re-time the sound, so the
 * sound keeps its length (and stays in sync with the picture).
 */
export const VOICE_EFFECTS = [
  "ardilla",
  "monstruo",
  "robot",
  "radio",
  "alien",
  "cueva",
  "eco",
  "reversa",
  "megafono",
  "videojuego",
  "fantasma",
  "mareado",
  "coro",
  "agua",
] as const;
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
    case "megafono":
      // Narrow band + gentle bit-crush grit: a loudspeaker.
      return ["highpass=f=600", "lowpass=f=4000", "acrusher=level_in=1:level_out=1:bits=8:mode=log:aa=1"];
    case "videojuego":
      // 4-bit, sample-and-hold: an old console.
      return ["acrusher=bits=4:mode=lin:samples=6:aa=0"];
    case "fantasma":
      // Reverse reverb: the echo swells IN before each word.
      return ["areverse", "aecho=0.8:0.88:180|360:0.5|0.3", "areverse"];
    case "mareado":
      return ["vibrato=f=2:d=0.7", "tremolo=f=3:d=0.4"];
    case "coro":
      return ["chorus=0.6:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3"];
    case "agua":
      return ["lowpass=f=500", "vibrato=f=4:d=0.3"];
    case "eco":
      return ["aecho=0.8:0.85:120|260:0.45|0.25"];
    case "reversa":
      return ["areverse"];
    default:
      return [];
  }
}
