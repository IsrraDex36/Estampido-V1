import { proto } from "baileys";
import { describe, expect, it } from "vitest";
import { SentMessageCache } from "../../src/adapters/bot/sentCache.js";
import {
  buildAudioStickerPayload,
  installRawEncode,
  makeAudioStickerMessage,
} from "../../src/adapters/bot/soundSticker.js";
import { fieldNumbers } from "../../src/utils/protobufRaw.js";

describe("SentMessageCache", () => {
  it("stores, retrieves and evicts oldest", () => {
    const c = new SentMessageCache(2);
    c.set("a", { conversation: "1" });
    c.set("b", { conversation: "2" });
    c.set("c", { conversation: "3" });
    expect(c.get("a")).toBeUndefined();
    expect(c.get("c")?.conversation).toBe("3");
    expect(c.size).toBe(2);
  });

  it("ignores empty ids/messages", () => {
    const c = new SentMessageCache();
    c.set(undefined, { conversation: "x" });
    c.set("id", undefined);
    expect(c.size).toBe(0);
    expect(c.get(undefined)).toBeUndefined();
  });

  it("a cached native sound sticker re-encodes with field 134 (retry path)", () => {
    installRawEncode();
    const msg = makeAudioStickerMessage(buildAudioStickerPayload({ mimetype: "image/webp" }, { seconds: 3 }));
    const c = new SentMessageCache();
    c.set("m1", msg);
    const bytes = Buffer.from(proto.Message.encode(c.get("m1") as proto.IMessage).finish());
    expect(fieldNumbers(bytes)).toContain(134);
  });
});
