import type { VoiceEffect } from "@contract";

/**
 * «Escuchar» a voice effect before creating: the same idea as the server's
 * ffmpeg filters, rebuilt with Web Audio in the browser (close, not exact:
 * pitch effects here also change speed). No upload, no server work.
 */
export const PREVIEW_MAX_SEC = 6;

/** Which part of which file to preview. Pure (tested). */
export function previewWindow(o: {
  kind: "video" | "gif" | "image" | null;
  hasAudioFile: boolean;
  startSec: number;
  durationSec?: number;
  audioStartSec: number;
  audioDurationSec?: number;
}): { from: "audio" | "media"; start: number; duration: number } | null {
  if (o.hasAudioFile) {
    const len = o.audioDurationSec ?? o.durationSec ?? PREVIEW_MAX_SEC;
    return { from: "audio", start: o.audioStartSec, duration: Math.min(PREVIEW_MAX_SEC, len) };
  }
  if (o.kind !== "video") return null; // GIFs and images have no sound of their own
  return { from: "media", start: o.startSec, duration: Math.min(PREVIEW_MAX_SEC, o.durationSec ?? PREVIEW_MAX_SEC) };
}

/** Reverse every channel's samples in place. Pure on the arrays (tested). */
export function reverseChannels(channels: Float32Array[]): void {
  for (const ch of channels) ch.reverse();
}

const decoded = new WeakMap<Blob, Promise<AudioBuffer>>();

/** Decode a file's audio once (video files too: the browser reads their sound track). */
export function decodeAudio(ctx: BaseAudioContext, file: Blob): Promise<AudioBuffer> {
  let p = decoded.get(file);
  if (!p) {
    p = file.arrayBuffer().then((b) => ctx.decodeAudioData(b));
    p.catch(() => decoded.delete(file));
    decoded.set(file, p);
  }
  return p;
}

/** Copy [start, start+duration) of a buffer (reversed for «reversa»). */
function slice(ctx: BaseAudioContext, buf: AudioBuffer, start: number, duration: number, reverse: boolean): AudioBuffer {
  const from = Math.min(buf.length, Math.max(0, Math.floor(start * buf.sampleRate)));
  const to = Math.min(buf.length, from + Math.max(1, Math.floor(duration * buf.sampleRate)));
  const out = ctx.createBuffer(buf.numberOfChannels, Math.max(1, to - from), buf.sampleRate);
  const chans: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c).slice(from, to);
    chans.push(data);
  }
  if (reverse) reverseChannels(chans);
  chans.forEach((d, c) => out.copyToChannel(d, c));
  return out;
}

/** Echo bus: delayed copies with feedback, mixed back in. */
function echo(ctx: AudioContext, input: AudioNode, out: AudioNode, delays: number[], feedback: number, wet: number) {
  for (const [i, t] of delays.entries()) {
    const d = ctx.createDelay(1);
    d.delayTime.value = t;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const w = ctx.createGain();
    w.gain.value = wet * (1 - i * 0.2);
    input.connect(d);
    d.connect(fb).connect(d);
    d.connect(w).connect(out);
  }
}

/**
 * Play the window with an effect. Returns stop(); `onEnded` fires when it
 * finishes on its own.
 */
export function playEffect(
  ctx: AudioContext,
  buf: AudioBuffer,
  win: { start: number; duration: number },
  effect: VoiceEffect | undefined,
  onEnded: () => void,
): () => void {
  const src = ctx.createBufferSource();
  src.buffer = slice(ctx, buf, win.start, win.duration, effect === "reversa");
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  const extra: AudioScheduledSourceNode[] = [];
  let tail = 0;

  switch (effect) {
    case "ardilla":
      src.playbackRate.value = 1.5;
      src.connect(out);
      break;
    case "monstruo":
      src.playbackRate.value = 0.7;
      src.connect(out);
      break;
    case "robot": {
      // Ring modulation: the classic metallic voice.
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = 55;
      osc.connect(ring.gain);
      extra.push(osc);
      src.connect(ring).connect(out);
      break;
    }
    case "radio": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -30;
      comp.ratio.value = 6;
      src.connect(hp).connect(lp).connect(comp).connect(out);
      break;
    }
    case "alien": {
      // Vibrato: a tiny delay whose time wobbles.
      const d = ctx.createDelay(0.05);
      d.delayTime.value = 0.008;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 0.004;
      lfo.connect(depth).connect(d.delayTime);
      extra.push(lfo);
      src.connect(d).connect(out);
      break;
    }
    case "cueva":
      src.connect(out);
      echo(ctx, src, out, [0.06, 0.12, 0.24, 0.48], 0.35, 0.45);
      tail = 1.2;
      break;
    case "eco":
      src.connect(out);
      echo(ctx, src, out, [0.12, 0.26], 0.4, 0.5);
      tail = 0.8;
      break;
    default:
      src.connect(out);
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      src.stop();
    } catch {
      // already ended
    }
    for (const n of extra) {
      try {
        n.stop();
      } catch {
        // already ended
      }
    }
    out.disconnect();
  };
  src.onended = () => {
    // Let echoes ring out, then clean up.
    setTimeout(() => {
      if (!stopped) {
        stop();
        onEnded();
      }
    }, tail * 1000);
  };
  for (const n of extra) n.start();
  src.start();
  return stop;
}
