import type { Readable } from "node:stream";
import { downloadContentFromMessage, type MediaType, type proto } from "baileys";
import { formatMB, UserInputError } from "../../core/errors.js";

type Downloadable = (proto.Message.IVideoMessage | proto.Message.IAudioMessage) & {
  fileLength?: number | { toNumber(): number } | null;
};

export type Downloader = (msg: Downloadable, type: MediaType) => Promise<AsyncIterable<Buffer> & Partial<Readable>>;

const declaredSize = (msg: Downloadable): number | null => {
  const v = msg.fileLength;
  if (v == null) return null;
  const n = typeof v === "number" ? v : v.toNumber();
  return Number.isFinite(n) ? n : null;
};

/**
 * Download WhatsApp media with a hard byte cap. Rejects up front from the
 * declared `fileLength` (no bandwidth spent), and again while streaming in
 * case the declared size is missing or wrong.
 */
export async function downloadLimited(
  msg: Downloadable,
  type: MediaType,
  maxBytes: number,
  what: string,
  download: Downloader = (m, t) => downloadContentFromMessage(m, t),
): Promise<Buffer> {
  const tooBig = () => new UserInputError(`${what} supera el límite de ${formatMB(maxBytes)}.`);
  const declared = declaredSize(msg);
  if (declared !== null && declared > maxBytes) throw tooBig();

  const stream = await download(msg, type);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) {
      stream.destroy?.();
      throw tooBig();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
