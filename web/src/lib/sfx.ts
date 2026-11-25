import { create } from "zustand";

/**
 * Tiny UI sound effects synthesized on the fly with Web Audio: no audio
 * files, so nothing to license (100 % original, copyright-free). Only ever
 * played from a user gesture; muting is remembered per browser.
 */
const MUTE_KEY = "estampido-sfx-muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

interface SfxState {
  muted: boolean;
  toggle: () => void;
}

export const useSfx = create<SfxState>()((set, get) => ({
  muted: readMuted(),
  toggle: () => {
    const muted = !get().muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // per-visit only
    }
    set({ muted });
  },
}));

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (useSfx.getState().muted || typeof AudioContext === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One enveloped oscillator note. */
function tone(
  a: AudioContext,
  { type, from, to, at = 0, dur, peak }: { type: OscillatorType; from: number; to?: number; at?: number; dur: number; peak: number },
) {
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.6);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Short filtered noise burst (the «crack» of the pum). */
function burst(a: AudioContext, { at = 0, dur = 0.08, peak = 0.22 } = {}) {
  const t0 = a.currentTime + at;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  const gain = a.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** «¡PUM!»: a soft little boom (Estampido = bang). */
  pum() {
    const a = audio();
    if (!a) return;
    tone(a, { type: "sine", from: 170, to: 52, dur: 0.38, peak: 0.55 });
    burst(a);
  },
  /** Step forward / back. */
  blip(up = true) {
    const a = audio();
    if (!a) return;
    tone(a, { type: "triangle", from: up ? 660 : 520, to: up ? 880 : 440, dur: 0.11, peak: 0.12 });
  },
  /** Finish: a quick happy arpeggio + pum. */
  tada() {
    const a = audio();
    if (!a) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(a, { type: "triangle", from: f, at: i * 0.07, dur: 0.16, peak: 0.12 });
    });
    tone(a, { type: "sine", from: 170, to: 52, at: 0.3, dur: 0.38, peak: 0.45 });
  },
};
