import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hkdfInfoKey, MEDIA_PATH_MAP, type WAMessage } from "baileys";
import { describe, expect, it } from "vitest";
import { savePackCapture } from "../../src/adapters/bot/packCapture.js";
import { registerStickerPackMedia, STICKER_PACK_TYPE } from "../../src/adapters/bot/stickerPackMedia.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";

describe("sticker-pack media registration", () => {
  it("encryption info resolves to 'WhatsApp Sticker Pack Keys'; idempotent", () => {
    registerStickerPackMedia();
    registerStickerPackMedia("/other");
    expect(hkdfInfoKey(STICKER_PACK_TYPE as never)).toBe("WhatsApp Sticker Pack Keys");
    expect((MEDIA_PATH_MAP as Record<string, string>)[STICKER_PACK_TYPE]).toBe("/mms/sticker-pack");
  });
});

describe("savePackCapture (injected download)", () => {
  it("saves the pack zip, lists it and finds which key decrypts the thumbnail", async () => {
    const root = await mkdtemp(join(tmpdir(), "sva-pack-"));
    try {
      // a real zip with a contents.json + a fake sticker
      const work = await mkdtemp(join(tmpdir(), "sva-zip-"));
      await run(ffmpegPath(), [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=96x96",
        "-frames:v",
        "1",
        join(work, "tray.png"),
      ]);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(work, "contents.json"), JSON.stringify({ stickers: [{ image_file: "a.webp" }] }));
      await writeFile(join(work, "a.webp"), "RIFF\0\0\0\0WEBP");
      await run("zip", [
        "-q",
        "-j",
        join(work, "p.zip"),
        join(work, "contents.json"),
        join(work, "a.webp"),
        join(work, "tray.png"),
      ]);
      const zip = await readFile(join(work, "p.zip"));
      const png = await readFile(join(work, "tray.png"));

      const msg = {
        key: { id: "P1" },
        message: {
          stickerPackMessage: {
            name: "Mi pack",
            stickers: [{ fileName: "a.webp" }],
            thumbnailDirectPath: "/thumb",
            directPath: "/zip",
          },
        },
      } as unknown as WAMessage;
      const { dir, report } = await savePackCapture(root, msg, async (_m, type) => {
        if (type === "sticker-pack") return zip;
        // pretend only the 2nd candidate decrypts the thumbnail
        const { MEDIA_HKDF_KEY_MAPPING } = await import("baileys");
        if ((MEDIA_HKDF_KEY_MAPPING as Record<string, string>)[type] === "Sticker Pack") return png;
        throw new Error("bad mac");
      });
      expect(report).toMatchObject({ name: "Mi pack", stickers: 1, zip: { isZip: true } });
      expect(String(report.zipListing)).toMatch(/contents\.json/);
      expect(report.contentsJson).toMatch(/image_file/);
      expect(report.thumbnail).toMatchObject({ hkdf: "WhatsApp Sticker Pack Keys", format: "png" });
      expect((await readFile(join(dir, "report.json"), "utf8")).length).toBeGreaterThan(10);
      await rm(work, { recursive: true, force: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
