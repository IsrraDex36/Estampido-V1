/**
 * WebP RIFF chunk read/write (pure). Used to embed EXIF metadata without
 * re-encoding. Spec: https://developers.google.com/speed/webp/docs/riff_container
 */
export interface Chunk {
  fourcc: string;
  data: Buffer;
}

export function readChunks(webp: Buffer): Chunk[] {
  if (webp.length < 12 || webp.toString("ascii", 0, 4) !== "RIFF" || webp.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Not a WebP file");
  }
  const chunks: Chunk[] = [];
  let off = 12;
  while (off + 8 <= webp.length) {
    const fourcc = webp.toString("ascii", off, off + 4);
    const size = webp.readUInt32LE(off + 4);
    if (off + 8 + size > webp.length) throw new Error(`Truncated chunk ${fourcc}`);
    chunks.push({ fourcc, data: webp.subarray(off + 8, off + 8 + size) });
    off += 8 + size + (size & 1);
  }
  return chunks;
}

export function writeChunks(chunks: Chunk[]): Buffer {
  const parts = chunks.flatMap(({ fourcc, data }) => {
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, "ascii");
    head.writeUInt32LE(data.length, 4);
    return data.length & 1 ? [head, data, Buffer.alloc(1)] : [head, data];
  });
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write("WEBP", 8, "ascii");
  return Buffer.concat([riff, body]);
}

const FLAG_ANIM = 0x02;
const FLAG_EXIF = 0x08;
const FLAG_ALPHA = 0x10;

/** Canvas size + alpha for a simple (non-VP8X) WebP. */
function simpleInfo(chunks: Chunk[]): { w: number; h: number; alpha: boolean } {
  const vp8l = chunks.find((c) => c.fourcc === "VP8L");
  if (vp8l) {
    const bits = vp8l.data.readUInt32LE(1);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, alpha: ((bits >> 28) & 1) === 1 };
  }
  const vp8 = chunks.find((c) => c.fourcc === "VP8 ");
  if (!vp8) throw new Error("WebP without image data");
  return {
    w: vp8.data.readUInt16LE(6) & 0x3fff,
    h: vp8.data.readUInt16LE(8) & 0x3fff,
    alpha: chunks.some((c) => c.fourcc === "ALPH"),
  };
}

function makeVp8x(flags: number, w: number, h: number): Chunk {
  const data = Buffer.alloc(10);
  data.writeUInt8(flags, 0);
  data.writeUIntLE(w - 1, 4, 3);
  data.writeUIntLE(h - 1, 7, 3);
  return { fourcc: "VP8X", data };
}

/**
 * Return a copy of `webp` with `exif` as its EXIF chunk (replacing any
 * existing one) and the VP8X EXIF flag set. Simple WebPs are upgraded to the
 * extended format. Image data is untouched.
 */
export function embedExif(webp: Buffer, exif: Buffer): Buffer {
  let chunks = readChunks(webp).filter((c) => c.fourcc !== "EXIF");
  const vp8xIndex = chunks.findIndex((c) => c.fourcc === "VP8X");
  if (vp8xIndex >= 0) {
    const vp8x = chunks[vp8xIndex] as Chunk;
    const data = Buffer.from(vp8x.data);
    data.writeUInt8(data.readUInt8(0) | FLAG_EXIF, 0);
    chunks[vp8xIndex] = { fourcc: "VP8X", data };
  } else {
    const { w, h, alpha } = simpleInfo(chunks);
    chunks = [makeVp8x(FLAG_EXIF | (alpha ? FLAG_ALPHA : 0), w, h), ...chunks];
  }
  // Spec order: …image data, EXIF, XMP.
  const xmp = chunks.findIndex((c) => c.fourcc === "XMP ");
  const exifChunk = { fourcc: "EXIF", data: exif };
  if (xmp >= 0) chunks.splice(xmp, 0, exifChunk);
  else chunks.push(exifChunk);
  return writeChunks(chunks);
}

export const readExif = (webp: Buffer): Buffer | null =>
  readChunks(webp).find((c) => c.fourcc === "EXIF")?.data ?? null;

/** Bytes an EXIF payload adds to a WebP (chunk header + padding). */
export const exifOverhead = (exif: Buffer): number => 8 + exif.length + (exif.length & 1);

export { FLAG_ALPHA, FLAG_ANIM, FLAG_EXIF };
