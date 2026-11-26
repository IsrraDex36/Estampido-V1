/**
 * Time helpers for the segment UI. Accepts "90", "90.5", "1:30", "1:30.5",
 * "0:01:30" (h:mm:ss). Pure → tested from the root suite.
 */
export function parseTime(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (s === "") return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const [, h, min, sec] = m;
  if (Number(sec) >= 60 || (h !== undefined && Number(min) >= 60)) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec);
}

/** 5 → "0:05", 90.5 → "1:30.5", 3725 → "1:02:05". Tenths only when needed. */
export function formatTime(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec * 10) / 10);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = (Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(Number.isInteger(s) ? 2 : 4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Human label for presets: 5 → "5 s", 60 → "1 min", 90 → "1:30". */
export function presetLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  return sec % 60 === 0 ? `${sec / 60} min` : formatTime(sec);
}

/**
 * Rough smoothness tier inside the 500 KB budget. Up to 10 s the server keeps
 * the 14–15 fps standard (it lowers detail/quality instead); longer clips may
 * drop under it (measured: busy 15 s ≈ 13 fps, a few fps at 30 s+).
 */
export type Smoothness = "fluid" | "reduced" | "slideshow";
export function smoothnessFor(durationSec: number, hq: boolean): Smoothness {
  const effective = hq ? durationSec / 10 : durationSec; // hq ≈ 10× budget
  if (effective <= 10) return "fluid";
  if (effective <= 40) return "reduced";
  return "slideshow";
}
