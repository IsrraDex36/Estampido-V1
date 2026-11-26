export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatSeconds(sec: number, digits = 1): string {
  return `${sec.toFixed(digits)} s`;
}

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });
/** From 100 k up a decimal is noise («123 k», not «123.5 k»). */
const compactWhole = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat("es-MX");

/**
 * Counts that always fit: 999 → «999», 9 876 → «9.9 k», 370 368 → «370 k»,
 * 1 234 567 → «1.2 M». Bad input → «0». Pure.
 */
export function compactNumber(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return plain.format(Math.round(n));
  return n < 100_000 || n >= 1_000_000 ? compact.format(n) : compactWhole.format(n);
}

/** «1 uso» / «12 usos» / «1.2 k usos». */
export const countLabel = (n: number, one: string, many: string): string =>
  `${compactNumber(n)} ${Math.round(n) === 1 ? one : many}`;

/** Exact number with thousands separators (for tooltips: the full value behind a compact one). */
export const exactNumber = (n: number): string => plain.format(Math.round(n));
