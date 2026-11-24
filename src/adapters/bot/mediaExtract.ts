import { downloadContentFromMessage, type MediaType } from "baileys";
import { decodeRaw, tryDecodeRaw } from "../../utils/protobufRaw.js";

/**
 * Generic media finder over a raw protobuf tree: any nested message holding a
 * WhatsApp CDN url or directPath plus 32-byte candidates for mediaKey. Field
 * numbers differ per message type (and are unknown for new types), so each
 * 32-byte field is tried as the key; a wrong key fails AES/padding.
 */
export interface MediaCandidate {
  /** Field path from root, e.g. "134.1.26". */
  path: string;
  url?: string;
  directPath?: string;
  mimetype?: string;
  keyCandidates: Buffer[];
}

const MIME_RE = /^[a-z]+\/[a-z0-9.+-]+(;.*)?$/i;

export function findMediaCandidates(buf: Buffer, path = ""): MediaCandidate[] {
  const fields = tryDecodeRaw(buf);
  if (!fields) return [];
  const out: MediaCandidate[] = [];
  const here: MediaCandidate = { path: path || "(root)", keyCandidates: [] };

  for (const f of fields) {
    if (f.wire !== 2) continue;
    const v = f.value as Buffer;
    const s = v.toString("utf8");
    if (s.startsWith("https://mmg.whatsapp.net") || s.startsWith("https://")) here.url ??= s;
    else if (s.startsWith("/v/t62.") || s.startsWith("/o1/")) here.directPath ??= s;
    else if (MIME_RE.test(s) && v.length < 80) here.mimetype ??= s;
    else if (v.length === 32) here.keyCandidates.push(v);
    // Recurse into nested messages.
    const childPath = path ? `${path}.${f.field}` : String(f.field);
    if (v.length > 2 && tryDecodeRaw(v)) out.push(...findMediaCandidates(v, childPath));
  }
  if ((here.url || here.directPath) && here.keyCandidates.length) out.unshift(here);
  return out;
}

const MAGIC: [string, (b: Buffer) => boolean][] = [
  ["webp", (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"],
  ["ogg", (b) => b.toString("ascii", 0, 4) === "OggS"],
  ["mp4", (b) => b.toString("ascii", 4, 8) === "ftyp"],
  ["png", (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ["jpg", (b) => b[0] === 0xff && b[1] === 0xd8],
  ["mp3", (b) => b.toString("ascii", 0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)],
];

export const sniffExtension = (b: Buffer): string => MAGIC.find(([, test]) => test(b))?.[0] ?? "bin";

function mediaTypesFor(mimetype?: string): MediaType[] {
  const all: MediaType[] = ["sticker", "audio", "image", "video", "document"];
  if (!mimetype) return all;
  const first: MediaType = mimetype.startsWith("audio/")
    ? "audio"
    : mimetype === "image/webp"
      ? "sticker"
      : mimetype.startsWith("image/")
        ? "image"
        : mimetype.startsWith("video/")
          ? "video"
          : "document";
  return [first, ...all.filter((t) => t !== first)];
}

async function streamToBuffer(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

export interface ExtractedMedia {
  path: string;
  mimetype?: string;
  mediaType: MediaType;
  ext: string;
  data: Buffer;
}

export async function downloadCandidate(c: MediaCandidate): Promise<ExtractedMedia | null> {
  for (const mediaType of mediaTypesFor(c.mimetype)) {
    for (const mediaKey of c.keyCandidates) {
      try {
        const stream = await downloadContentFromMessage({ mediaKey, directPath: c.directPath, url: c.url }, mediaType);
        const data = await streamToBuffer(stream);
        const ext = sniffExtension(data);
        if (data.length > 0 && ext !== "bin") return { path: c.path, mimetype: c.mimetype, mediaType, ext, data };
      } catch {
        // wrong key/type → try next
      }
    }
  }
  return null;
}

/** Re-export for capture summaries. */
export { decodeRaw };
