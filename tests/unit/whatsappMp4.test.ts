import { describe, expect, it } from "vitest";
import { buildWhatsAppMp4Args, whatsappMp4Duration } from "../../src/core/video/whatsappMp4.js";

describe("«Exportar para WhatsApp» MP4", () => {
  it("caps the length like WhatsApp does: 5 s animated, 10 s still", () => {
    expect(whatsappMp4Duration(true, 12)).toBe(5);
    expect(whatsappMp4Duration(true, 3.2)).toBe(3.2);
    expect(whatsappMp4Duration(false, 12)).toBe(10);
    expect(whatsappMp4Duration(false, 7.5)).toBe(7.5);
    expect(whatsappMp4Duration(false)).toBe(3); // silent still: a short clip
    expect(whatsappMp4Duration(true)).toBe(5);
  });

  it("animated: webp_anim decoder, white background, H.264 + AAC, faststart", () => {
    const a = buildWhatsAppMp4Args({
      webp: "s.webp",
      audio: "s.ogg",
      audioDurationSec: 8,
      animated: true,
      output: "o.mp4",
    });
    expect(a.slice(a.indexOf("-c:v"), a.indexOf("-c:v") + 4)).toEqual(["-c:v", "webp_anim", "-i", "s.webp"]);
    const graph = a[a.indexOf("-filter_complex") + 1] ?? "";
    expect(graph).toContain("color=c=white:s=512x512");
    expect(graph).toContain("tpad=stop_mode=clone");
    expect(a).toEqual(expect.arrayContaining(["libx264", "aac", "+faststart"]));
    expect(a[a.indexOf("-t") + 1]).toBe("5");
    expect(a.at(-1)).toBe("o.mp4");
  });

  it("still: loops the image; no audio → -an", () => {
    const a = buildWhatsAppMp4Args({ webp: "s.webp", animated: false, output: "o.mp4" });
    expect(a.slice(4, 8)).toEqual(["-loop", "1", "-i", "s.webp"]);
    expect(a).toContain("-an");
    expect(a).not.toContain("aac");
    expect(a[a.indexOf("-t") + 1]).toBe("3");
  });
});
