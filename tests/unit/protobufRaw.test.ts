import { proto } from "baileys";
import { describe, expect, it } from "vitest";
import {
  decodeRaw,
  encodeBytesField,
  encodeVarint,
  fieldNumbers,
  rawTree,
  tryDecodeRaw,
} from "../../src/utils/protobufRaw.js";

describe("varint", () => {
  it.each([
    [0, "00"],
    [1, "01"],
    [127, "7f"],
    [128, "8001"],
    [300, "ac02"],
    [(134 << 3) | 2, "b208"],
  ])("%d → %s", (n, hex) => {
    expect(encodeVarint(n).toString("hex")).toBe(hex);
  });
});

describe("decodeRaw", () => {
  it("round-trips Baileys-encoded message", () => {
    const buf = Buffer.from(
      proto.Message.encode({
        conversation: "hola",
        stickerMessage: { isAnimated: true },
      }).finish(),
    );
    const fields = decodeRaw(buf);
    expect(fields.map((f) => f.field)).toEqual([1, 26]);
    expect((fields[0]?.value as Buffer).toString()).toBe("hola");
  });

  it("sees field 134 that Baileys drops", () => {
    const inner = Buffer.from(
      proto.Message.encode({
        stickerMessage: { mimetype: "image/webp" },
      }).finish(),
    );
    const futureProof = encodeBytesField(1, inner);
    const buf = Buffer.concat([
      Buffer.from(proto.Message.encode({ conversation: "x" }).finish()),
      encodeBytesField(134, futureProof),
    ]);
    expect(fieldNumbers(buf)).toEqual([1, 134]);
    expect(Object.keys(proto.Message.decode(buf).toJSON())).toEqual([
      "conversation",
    ]);

    const tree = rawTree(buf);
    const f134 = tree.find((t) => t.field === 134);
    expect(f134 && "message" in f134).toBe(true);
    expect(JSON.stringify(tree)).toContain("image/webp");
  });

  it("tryDecodeRaw returns null for garbage", () => {
    expect(tryDecodeRaw(Buffer.from([0x0a, 0xff]))).toBeNull();
    expect(tryDecodeRaw(Buffer.alloc(0))).toEqual([]);
  });
});
