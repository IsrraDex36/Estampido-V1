/**
 * Time parsing/formatting shared by server adapters (bot). Mirrors
 * web/src/lib/time.ts. Accepts "90", "90.5", "1:30", "1:30.5", "0:01:30".
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

/** 5 → "0:05", 90.5 → "1:30.5", 3725 → "1:02:05". */
export function formatTime(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec * 10) / 10);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = (Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(Number.isInteger(s) ? 2 : 4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
