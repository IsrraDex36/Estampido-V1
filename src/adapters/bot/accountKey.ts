import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { accountSecretFile } from "../../config/paths.js";

/**
 * Stable, private account identifier for a WhatsApp user.
 *
 * The API must recognize «the same person» across browsers and bot-number
 * changes without ever learning the phone number. The bot (which sees it)
 * derives an HMAC-SHA256 with a server secret: same number → same key; the
 * key can't be reversed or brute-forced without the secret (unlike a plain
 * hash of a ~10-digit number).
 */
export function accountKeyFor(identityJid: string, secret: Buffer): string {
  const [user = "", server = ""] = identityJid.split("@");
  const id = user.split(":")[0]?.replace(/\D/g, "") ?? ""; // drop the device suffix
  const kind = server === "lid" ? "lid" : "pn";
  return createHmac("sha256", secret).update(`estampido-account:${kind}:${id}`).digest("hex");
}

/** Read the secret, or create it once (0600). Concurrent first starts agree on one file. */
export async function loadAccountSecret(file = accountSecretFile()): Promise<Buffer> {
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing && /^[0-9a-f]{64}$/.test(existing.trim())) return Buffer.from(existing.trim(), "hex");
  await mkdir(dirname(file), { recursive: true });
  const fresh = randomBytes(32).toString("hex");
  try {
    await writeFile(file, fresh, { mode: 0o600, flag: "wx" });
    return Buffer.from(fresh, "hex");
  } catch {
    // Another process won the race (or the file was malformed): use what's there.
    const now = (await readFile(file, "utf8")).trim();
    if (!/^[0-9a-f]{64}$/.test(now)) throw new Error(`Secreto de cuentas inválido en ${file}`);
    return Buffer.from(now, "hex");
  }
}

/**
 * The jid that identifies the PERSON: the phone-number jid when WhatsApp gives
 * one (it may deliver an anonymous @lid as the chat id, with the phone jid as
 * `remoteJidAlt`), else the chat jid.
 */
export function identityJid(chatJid: string, altJid?: string | null): string {
  const candidates = [chatJid, altJid ?? ""].map((j) => j.replace(/:\d+(?=@)/, ""));
  return candidates.find((j) => j.endsWith("@s.whatsapp.net")) ?? (candidates[0] as string);
}
