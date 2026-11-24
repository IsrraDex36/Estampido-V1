import type { FitMode } from "../../config/limits.js";

export interface SaudioCommand {
  startSec: number;
  durationSec: number;
  fit: FitMode;
}

/**
 * Parse `/saudio [start] [duration] [crop|pad]` (also `!saudio`, `.saudio`).
 * Returns null if text isn't the command; throws with a user-facing message
 * on bad arguments.
 */
export function parseSaudio(
  text: string | null | undefined,
  maxDuration = 5,
): SaudioCommand | null {
  const parts = (text ?? "").trim().split(/\s+/);
  if (!/^[/!.]saudio$/i.test(parts[0] ?? "")) return null;

  const cmd: SaudioCommand = {
    startSec: 0,
    durationSec: maxDuration,
    fit: "pad",
  };
  const nums: number[] = [];
  for (const p of parts.slice(1)) {
    if (/^(crop|pad)$/i.test(p)) cmd.fit = p.toLowerCase() as FitMode;
    else if (/^\d+(\.\d+)?$/.test(p)) nums.push(Number(p));
    else
      throw new Error(
        `Argumento no válido: "${p}". Uso: /saudio [inicio] [duración] [crop|pad]`,
      );
  }
  if (nums[0] !== undefined) cmd.startSec = nums[0];
  if (nums[1] !== undefined) {
    if (nums[1] <= 0 || nums[1] > maxDuration)
      throw new Error(`La duración debe estar entre 0 y ${maxDuration} s.`);
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
export function isAllowedSender(
  key: KeyLike,
  allowed: ReadonlySet<string>,
): boolean {
  if (key.fromMe) return true;
  const isGroup = key.remoteJid?.endsWith("@g.us");
  const candidates = isGroup
    ? [key.participant, key.participantAlt]
    : [key.remoteJid, key.remoteJidAlt];
  return candidates.some((j) => {
    const d = jidDigits(j);
    return (
      d !== null && j?.endsWith("@s.whatsapp.net") === true && allowed.has(d)
    );
  });
}
