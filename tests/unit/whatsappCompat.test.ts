import { describe, expect, it } from "vitest";
import { formatSummary } from "../../src/adapters/bot/summary.js";
import { buildVideoArgs } from "../../src/core/video/encodeVideo.js";
import { whatsappIssues } from "../../src/core/whatsappCompat.js";

const ok = { animated: true, animationSec: 5, audioSec: 5, bytes: 400 * 1024 };

describe("WhatsApp compatibility (official sticker guide + native sound stickers)", () => {
  it("a 5 s animated sound sticker under 500 KB is fine", () => {
    expect(whatsappIssues(ok)).toEqual([]);
    expect(whatsappIssues({ ...ok, animationSec: 10, audioSec: 10 })).toEqual([]); // the limit itself is OK
    expect(whatsappIssues({ animated: false, animationSec: 0, audioSec: 10, bytes: 60 * 1024 })).toEqual([]);
  });

  it("animation longer than 10 s → it freezes in the chat while the sound keeps going", () => {
    const issues = whatsappIssues({ ...ok, animationSec: 30, audioSec: 30 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dura 30 s y WhatsApp solo anima hasta 10 s/);
  });

  it("sound longer than the animation → they drift on every loop", () => {
    expect(whatsappIssues({ ...ok, animationSec: 2, audioSec: 5 })[0]).toMatch(/dura más que la animación/);
    expect(whatsappIssues({ ...ok, animationSec: 5, audioSec: 5.2 })).toEqual([]); // ≤ 0.25 s rounding is fine
  });

  it("too heavy (hq) or a still sticker with more than 10 s of sound", () => {
    expect(whatsappIssues({ ...ok, bytes: 2 * 1024 * 1024 })[0]).toMatch(/máx\. 500 KB/);
    expect(whatsappIssues({ animated: false, animationSec: 0, audioSec: 15, bytes: 50 * 1024 })[0]).toMatch(
      /hasta 10 s de sonido/,
    );
    expect(whatsappIssues({ animated: false, animationSec: 0, audioSec: null, bytes: 150 * 1024 })[0]).toMatch(
      /máx\. 100 KB/,
    );
  });
});

describe("looping a short animation to its sound", () => {
  it("uses the loop filter (not -stream_loop, which hangs on animated WebP)", () => {
    const args = buildVideoArgs({
      input: "a.webp",
      output: "o.webp",
      startSec: 0,
      durationSec: 5,
      seek: "output",
      loop: true,
    });
    expect(args).not.toContain("-stream_loop");
    expect(args[args.indexOf("-vf") + 1]).toMatch(/^loop=loop=-1:size=32767,fps=/);
    expect(args.slice(args.indexOf("-i"), args.indexOf("-i") + 6)).toEqual(["-i", "a.webp", "-ss", "0", "-t", "5"]);
    const plain = buildVideoArgs({ input: "v.mp4", output: "o.webp", startSec: 1, durationSec: 5 });
    expect(plain[plain.indexOf("-vf") + 1]).toMatch(/^fps=/);
  });
});

describe("bot summary warns about WhatsApp limits", () => {
  const result = (durationMs: number, audioSec: number) =>
    ({
      warnings: [],
      stats: {
        sticker: { animated: true, bytes: 450 * 1024, fps: 4, durationMs, quality: 40 },
        audio: { durationSec: audioSec },
      },
    }) as never;
  it("adds the reason when the sticker won't play right", () => {
    expect(formatSummary(result(5000, 5), "native")).not.toMatch(/WhatsApp solo anima/);
    expect(formatSummary(result(30000, 30), "native")).toMatch(
      /⚠️ La animación dura 30 s y WhatsApp solo anima hasta 10 s/,
    );
  });
});
