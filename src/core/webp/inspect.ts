/**
 * Minimal pure-TS WebP container parser (RIFF). Used to verify encoder output
 * without extra binaries. Spec: https://developers.google.com/speed/webp/docs/riff_container
 */
export interface WebpFrame {
  width: number;
  height: number;
  durationMs: number;
}

export interface WebpInfo {
  canvasWidth: number;
  canvasHeight: number;
  animated: boolean;
  hasAlpha: boolean;
  hasExif: boolean;
  loopCount?: number;
  frames: WebpFrame[];
  byteLength: number;
}

const u24 = (b: Buffer, o: number): number => b.readUIntLE(o, 3);

export function inspectWebp(buf: Buffer): WebpInfo {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Not a WebP file");
  }

  const info: WebpInfo = {
    canvasWidth: 0,
    canvasHeight: 0,
    animated: false,
    hasAlpha: false,
    hasExif: false,
    frames: [],
    byteLength: buf.length,
  };

  let off = 12;
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const data = off + 8;
    if (data + size > buf.length) throw new Error(`Truncated chunk ${fourcc}`);

    switch (fourcc) {
      case "VP8X": {
        const flags = buf.readUInt8(data);
        info.animated = (flags & 0x02) !== 0;
        info.hasExif = (flags & 0x08) !== 0;
        info.hasAlpha = (flags & 0x10) !== 0;
        info.canvasWidth = u24(buf, data + 4) + 1;
        info.canvasHeight = u24(buf, data + 7) + 1;
        break;
      }
      case "ANIM":
        info.loopCount = buf.readUInt16LE(data + 4);
        break;
      case "ANMF":
        info.frames.push({
          width: u24(buf, data + 6) + 1,
          height: u24(buf, data + 9) + 1,
          durationMs: u24(buf, data + 12),
        });
        break;
      case "VP8 ":
        // Simple lossy: 14-bit dims after 3-byte frame tag + 3-byte start code.
        if (!info.canvasWidth) {
          info.canvasWidth = buf.readUInt16LE(data + 6) & 0x3fff;
          info.canvasHeight = buf.readUInt16LE(data + 8) & 0x3fff;
        }
        break;
      case "VP8L":
        if (!info.canvasWidth) {
          const bits = buf.readUInt32LE(data + 1);
          info.canvasWidth = (bits & 0x3fff) + 1;
          info.canvasHeight = ((bits >> 14) & 0x3fff) + 1;
          info.hasAlpha = ((bits >> 28) & 1) === 1;
        }
        break;
    }
    off = data + size + (size & 1);
  }

  return info;
}

export const totalDurationMs = (info: WebpInfo): number => info.frames.reduce((sum, f) => sum + f.durationMs, 0);
