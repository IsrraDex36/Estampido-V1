/**
 * libsignal (used by Baileys) logs whole Signal session objects with
 * console.info/warn — «Closing session: SessionEntry { … privKey … rootKey … }».
 * Those are people's end-to-end encryption keys: they must NEVER reach the
 * logs (Coolify keeps them). This filter drops those lines at the source and
 * any argument that is a Signal session object, wherever it comes from.
 */
const SIGNAL_NOISE = [
  "Closing session",
  "Opening session",
  "Removing old closed session",
  "Session already closed",
  "Session already open",
  "Closing open session in favor of incoming prekey bundle",
  "Closing stale open session",
  "Decrypted message with closed session",
  "Migrating session to",
  "Unhandled bucket type",
];

const SECRET_CLASSES = new Set(["SessionEntry", "SessionRecord", "PreKeyRecord", "SignedPreKeyRecord"]);
const SECRET_KEYS =
  /^(privKey|privateKey|rootKey|chainKey|ephemeralKeyPair|noiseKey|signedIdentityKey|signedPreKey|advSecretKey)$/;

/** Does this value carry key material? (bounded walk: never slow, never loops) */
export function carriesSecrets(value: unknown, depth = 0, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object" || depth > 4 || seen.has(value)) return false;
  seen.add(value);
  const name = (value as object).constructor?.name;
  if (name && SECRET_CLASSES.has(name)) return true;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return false;
  let n = 0;
  for (const k of Object.keys(value)) {
    if (++n > 64) break;
    if (SECRET_KEYS.test(k)) return true;
    if (carriesSecrets((value as Record<string, unknown>)[k], depth + 1, seen)) return true;
  }
  return false;
}

/** Should this console call be dropped? Pure (tested). */
export function isSecretLog(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first === "string" && SIGNAL_NOISE.some((p) => first.startsWith(p))) return true;
  return args.some((a) => carriesSecrets(a));
}

let installed = false;
/** Patch console.* once for this process. */
export function installLogRedaction(target: Console = console): void {
  if (installed && target === console) return;
  if (target === console) installed = true;
  for (const m of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    const original = target[m].bind(target);
    target[m] = (...args: unknown[]) => {
      if (isSecretLog(args)) return;
      original(...args);
    };
  }
}
