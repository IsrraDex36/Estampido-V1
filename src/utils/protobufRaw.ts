/**
 * Schema-less protobuf wire-format reader/writer. Used to inspect and craft
 * fields that Baileys' generated WAProto doesn't know yet (e.g. field 134,
 * `audioStickerMessage`). Spec: https://protobuf.dev/programming-guides/encoding/
 */

export type RawValue =
  | { wire: 0; value: bigint }
  | { wire: 1; value: Buffer }
  | { wire: 2; value: Buffer }
  | { wire: 5; value: Buffer };

export interface RawField {
  field: number;
  wire: 0 | 1 | 2 | 5;
  value: bigint | Buffer;
}

function readVarint(buf: Buffer, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++] as number;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7n;
    if (shift > 63n) throw new Error("varint too long");
  }
  throw new Error("truncated varint");
}

/** Parse one message level. Throws on malformed input. */
export function decodeRaw(buf: Buffer): RawField[] {
  const fields: RawField[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const [key, afterKey] = readVarint(buf, pos);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field === 0) throw new Error("field number 0");
    pos = afterKey;
    switch (wire) {
      case 0: {
        const [v, next] = readVarint(buf, pos);
        fields.push({ field, wire, value: v });
        pos = next;
        break;
      }
      case 1:
        if (pos + 8 > buf.length) throw new Error("truncated fixed64");
        fields.push({ field, wire, value: buf.subarray(pos, pos + 8) });
        pos += 8;
        break;
      case 2: {
        const [len, next] = readVarint(buf, pos);
        const end = next + Number(len);
        if (end > buf.length) throw new Error("truncated length-delimited");
        fields.push({ field, wire, value: buf.subarray(next, end) });
        pos = end;
        break;
      }
      case 5:
        if (pos + 4 > buf.length) throw new Error("truncated fixed32");
        fields.push({ field, wire, value: buf.subarray(pos, pos + 4) });
        pos += 4;
        break;
      default:
        throw new Error(`unsupported wire type ${wire}`);
    }
  }
  return fields;
}

/** Try to parse bytes as a nested message; null if it isn't one. */
export function tryDecodeRaw(buf: Buffer): RawField[] | null {
  if (buf.length === 0) return [];
  try {
    return decodeRaw(buf);
  } catch {
    return null;
  }
}

const isPrintable = (buf: Buffer): boolean => {
  if (buf.length === 0) return false;
  const s = buf.toString("utf8");
  return !s.includes("�") && /^[\x20-\x7E -￿\t\n\r]*$/.test(s);
};

export type RawTree = { field: number; wire: number } & (
  | { varint: string }
  | { string: string }
  | { message: RawTree[]; bytes: number }
  | { hex: string; bytes: number }
);

/**
 * Recursive best-effort tree for humans. Length-delimited values are shown as
 * string if printable, nested message if parseable, else hex (truncated).
 */
export function rawTree(buf: Buffer, depth = 0, maxHex = 64): RawTree[] {
  return decodeRaw(buf).map((f): RawTree => {
    if (f.wire === 0)
      return {
        field: f.field,
        wire: 0,
        varint: (f.value as bigint).toString(),
      };
    const v = f.value as Buffer;
    if (f.wire === 2) {
      if (isPrintable(v))
        return { field: f.field, wire: 2, string: v.toString("utf8") };
      const nested = depth < 12 ? tryDecodeRaw(v) : null;
      if (nested && nested.length > 0) {
        return {
          field: f.field,
          wire: 2,
          message: rawTree(v, depth + 1, maxHex),
          bytes: v.length,
        };
      }
    }
    const hex =
      v.subarray(0, maxHex).toString("hex") + (v.length > maxHex ? "…" : "");
    return { field: f.field, wire: f.wire, hex, bytes: v.length };
  });
}

// ---- writer ----

export function encodeVarint(n: number | bigint): Buffer {
  let v = BigInt(n);
  if (v < 0n) throw new Error("negative varint");
  const out: number[] = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return Buffer.from(out);
}

/** Encode a length-delimited field (wire type 2). */
export function encodeBytesField(field: number, payload: Uint8Array): Buffer {
  return Buffer.concat([
    encodeVarint((field << 3) | 2),
    encodeVarint(payload.length),
    Buffer.from(payload),
  ]);
}

/** Top-level field numbers present in a message. */
export const fieldNumbers = (buf: Buffer): number[] => [
  ...new Set(decodeRaw(buf).map((f) => f.field)),
];
