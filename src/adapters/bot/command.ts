import { type FitMode, STICKER_LIMITS } from "../../config/limits.js";
import { formatTime, parseTime } from "../../utils/time.js";

export interface SaudioCommand {
  startSec: number;
  /** Omitted → pipeline default (5 s video/GIF, audio length up to 10 s for images). */
  durationSec?: number;
  fit: FitMode;
  /** `voz`/`audio` flag: wait for a voice note/audio to use instead of the video's sound. */
  customAudio: boolean;
  /** EXPERIMENTAL `hq` flag: lift the 500 KB cap (up to 1 MB). */
  hq: boolean;
}

export const SAUDIO_USAGE =
  "Uso: /saudio [inicio] [duración] [crop|pad] [voz] [hq] — con un video, GIF, imagen o sticker (o respondiendo a uno). Sin duración = 10 s (lo que WhatsApp anima).";

/**
 * Parse `/saudio [start] [duration] [crop|pad] [voz]` (also `!saudio`, `.saudio`).
 * Returns null if text isn't the command; throws with a user-facing message
 * on bad arguments.
 */
export function parseSaudio(
  text: string | null | undefined,
  maxDuration: number = Math.max(STICKER_LIMITS.maxDurationSec, STICKER_LIMITS.maxImageAudioSec),
  defaultFit: FitMode = "pad",
): SaudioCommand | null {
  const parts = (text ?? "").trim().split(/\s+/);
  if (!/^[/!.]saudio$/i.test(parts[0] ?? "")) return null;

  const cmd: SaudioCommand = {
    startSec: 0,
    fit: defaultFit,
    customAudio: false,
    hq: false,
  };
  const nums: number[] = [];
  for (const p of parts.slice(1)) {
    if (/^(crop|pad)$/i.test(p)) cmd.fit = p.toLowerCase() as FitMode;
    else if (/^(voz|audio)$/i.test(p)) cmd.customAudio = true;
    else if (/^hq$/i.test(p)) cmd.hq = true;
    else if (parseTime(p) !== null)
      nums.push(parseTime(p) as number); // 90, 1:30, 1:30.5
    else throw new Error(`Argumento no válido: "${p}". ${SAUDIO_USAGE}`);
  }
  if (nums[0] !== undefined) cmd.startSec = nums[0];
  if (nums[1] !== undefined) {
    if (nums[1] <= 0 || nums[1] > maxDuration) {
      throw new Error(`La duración debe estar entre 0 y ${formatTime(maxDuration)} (m:ss).`);
    }
    cmd.durationSec = nums[1];
  }
  return cmd;
}

/** Digits of a JID user part: "595981234567:12@s.whatsapp.net" → "595981234567". */
export const jidDigits = (jid: string | null | undefined): string | null => {
  const m = /^(\d+)(?::\d+)?@/.exec(jid ?? "");
  return m ? (m[1] as string) : null;
};

export interface KeyLike {
  fromMe?: boolean | null;
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
}

/**
 * Access control: own messages always allowed; others only if one of the
 * sender's phone-number JIDs is in `allowed` (digits). LID-only senders are
 * rejected unless Baileys provides the PN alt.
 */
export function isAllowedSender(key: KeyLike, allowed: ReadonlySet<string>): boolean {
  if (key.fromMe) return true;
  const isGroup = key.remoteJid?.endsWith("@g.us");
  const candidates = isGroup ? [key.participant, key.participantAlt] : [key.remoteJid, key.remoteJidAlt];
  return candidates.some((j) => {
    const d = jidDigits(j);
    return d !== null && j?.endsWith("@s.whatsapp.net") === true && allowed.has(d);
  });
}

/** `/cancelar` (also `!cancelar`, `.cancelar`, `/cancel`). */
export const isCancel = (text: string | null | undefined): boolean => /^[/!.]cancel(ar)?$/i.test((text ?? "").trim());
