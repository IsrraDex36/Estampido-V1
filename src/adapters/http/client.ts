import { createHash } from "node:crypto";

/** Browser id (random UUID) → SHA-256 hex. The raw id never leaves the API. */
export function clientHash(raw: string | undefined): string | null {
  if (!raw || !/^[0-9a-f-]{36}$/i.test(raw)) return null;
  return createHash("sha256").update(`estampido:${raw.toLowerCase()}`).digest("hex");
}
