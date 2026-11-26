import { STICKER_LIMITS } from "../config/limits.js";

export interface CompatInput {
  animated: boolean;
  /** Total animation length (s); 0 for still stickers. */
  animationSec: number;
  /** Sound length (s), null when silent. */
  audioSec: number | null;
  bytes: number;
}

/**
 * Why a sticker may not play right in WhatsApp (empty = fine). Based on the
 * official sticker guide (animated ≤ 10 s, ≤ 500 KB; the animation ends on its
 * first frame) and the native sound-sticker creator (≤ 10 s of sound). Pure.
 */
export function whatsappIssues({ animated, animationSec, audioSec, bytes }: CompatInput): string[] {
  const issues: string[] = [];
  const maxAnim = STICKER_LIMITS.whatsappMaxAnimationSec;
  const fmt = (s: number) => (s >= 10 ? Math.round(s) : Math.round(s * 10) / 10).toString().replace(".", ",");
  if (animated && animationSec > maxAnim + 0.05) {
    issues.push(
      `La animación dura ${fmt(animationSec)} s y WhatsApp solo anima hasta ${maxAnim} s: en el chat se quedará quieta mientras suena.`,
    );
  } else if (animated && audioSec !== null && audioSec > animationSec + 0.25) {
    issues.push(
      `El sonido (${fmt(audioSec)} s) dura más que la animación (${fmt(animationSec)} s): en WhatsApp se desfasan al repetirse.`,
    );
  }
  if (audioSec !== null && audioSec > maxAnim + 0.05 && !(animated && animationSec > maxAnim + 0.05)) {
    issues.push(`WhatsApp admite hasta ${maxAnim} s de sonido en un sticker; este dura ${fmt(audioSec)} s.`);
  }
  const maxBytes = animated ? STICKER_LIMITS.maxAnimatedBytes : STICKER_LIMITS.maxStaticBytes;
  if (bytes > maxBytes) {
    issues.push(
      `Pesa ${Math.round(bytes / 1024)} KB (máx. ${maxBytes / 1024} KB): WhatsApp podría no animarlo o rechazarlo.`,
    );
  }
  return issues;
}
