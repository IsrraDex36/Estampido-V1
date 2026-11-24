import { proto } from "baileys";
import { fieldNumbers } from "../../utils/protobufRaw.js";

/**
 * Baileys' generated `proto.Message.decode` silently drops fields it doesn't
 * know (e.g. 134 = audioStickerMessage). This wraps it to keep the raw bytes
 * of every top-level decode whose re-encoding is shorter than the input,
 * i.e. something unknown was dropped somewhere in the tree.
 */
export interface RawDecode {
  raw: Buffer;
  /** Top-level fields present in raw but lost after decode → encode. */
  droppedTopLevel: number[];
  /** Bytes lost in the round-trip (also catches nested unknown fields). */
  droppedBytes: number;
  at: number;
}

const RAW = Symbol.for("sva.rawMessage");
const recent: RawDecode[] = [];
const MAX_RECENT = 20;
const TTL_MS = 15_000;
let installed = false;

export function installRawCapture(): void {
  if (installed) return;
  installed = true;
  const original = proto.Message.decode;

  // Nested decodes are called with (Reader, length): only wrap top-level buffers.
  proto.Message.decode = function wrapped(
    this: unknown,
    r: unknown,
    l?: number,
  ) {
    const msg = original.call(this, r as Uint8Array, l);
    if (r instanceof Uint8Array && l === undefined) {
      try {
        const raw = Buffer.from(r);
        const reencoded = Buffer.from(proto.Message.encode(msg).finish());
        if (reencoded.length < raw.length) {
          const known = new Set(fieldNumbers(reencoded));
          const entry: RawDecode = {
            raw,
            droppedTopLevel: fieldNumbers(raw).filter((f) => !known.has(f)),
            droppedBytes: raw.length - reencoded.length,
            at: Date.now(),
          };
          Object.defineProperty(msg, RAW, { value: entry, enumerable: false });
          recent.push(entry);
          if (recent.length > MAX_RECENT) recent.shift();
        }
      } catch {
        // Never break Baileys' decode path because of diagnostics.
      }
    }
    return msg;
  } as typeof proto.Message.decode;
}

/**
 * Raw bytes for a decoded message: from the attached symbol if the object
 * survived, else the most recent unclaimed lossy decode (objects may be
 * re-created by Baileys between decode and the upsert event).
 */
export function takeRawFor(
  message: object | null | undefined,
): RawDecode | undefined {
  const attached = message
    ? (message as Record<symbol, RawDecode | undefined>)[RAW]
    : undefined;
  const now = Date.now();
  while (recent.length && now - (recent[0] as RawDecode).at > TTL_MS)
    recent.shift();
  if (attached) {
    const i = recent.indexOf(attached);
    if (i >= 0) recent.splice(i, 1);
    return attached;
  }
  return recent.pop();
}
