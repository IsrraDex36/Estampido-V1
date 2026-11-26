import { describe, expect, it } from "vitest";
import { ResourceGuard } from "../../src/adapters/http/resources.js";
import { assertSaneSize } from "../../src/pipeline/shared.js";
import { hardenArgs, SAFE_FORMATS } from "../../src/utils/ffmpeg.js";
import { describeFailure } from "../../web/src/features/converter/model/failure.js";

describe("ffmpeg can't be tricked into reading files or calling URLs", () => {
  it("every file input gets the protocol + format whitelist; generated inputs (lavfi) don't", () => {
    const args = hardenArgs("/usr/bin/ffmpeg", [
      "-y",
      "-ss",
      "1",
      "-i",
      "in.mp4",
      "-f",
      "lavfi",
      "-i",
      "color=c=red",
      "-i",
      "ov.png",
      "out.webp",
    ]);
    const guards = args.flatMap((a, i) => (a === "-protocol_whitelist" ? [args[i + 1]] : []));
    expect(guards).toEqual(["file,pipe", "file,pipe"]); // in.mp4 and ov.png, not lavfi
    expect(args[args.indexOf("in.mp4") - 2]).toBe(SAFE_FORMATS);
    expect(args.slice(args.indexOf("lavfi") - 1, args.indexOf("lavfi") + 3)).toEqual([
      "-f",
      "lavfi",
      "-i",
      "color=c=red",
    ]);
  });

  it("ffprobe: guard before its input; other binaries untouched", () => {
    expect(hardenArgs("ffprobe", ["-v", "error", "x"]).slice(0, 4)).toEqual([
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      SAFE_FORMATS,
    ]);
    expect(hardenArgs("node", ["-i", "x"])).toEqual(["-i", "x"]);
  });

  it("no playlist or file-referencing demuxers are allowed", () => {
    const allowed = SAFE_FORMATS.split(",");
    for (const bad of ["hls", "applehttp", "concat", "ffconcat", "dash", "tee", "data", "http"])
      expect(allowed).not.toContain(bad);
  });
});

describe("decompression bombs", () => {
  it("refuses gigantic pictures before decoding; real phone media passes", () => {
    expect(() => assertSaneSize({ width: 4032, height: 3024 })).not.toThrow(); // 12 MP photo
    expect(() => assertSaneSize({ width: 3840, height: 2160 })).not.toThrow(); // 4K video
    expect(() => assertSaneSize({ width: 30_000, height: 30_000 }, "la imagen")).toThrow(
      /La imagen es demasiado grande/,
    );
    expect(() => assertSaneSize({ width: 9000, height: 100 })).toThrow(); // one huge side
  });
});

describe("resource guard", () => {
  it("memory first, disk checked at most every 10 s", async () => {
    let now = 0;
    let free = 10e9;
    let rss = 100e6;
    let probes = 0;
    const g = new ResourceGuard(
      { minFreeBytes: 1.5e9, maxRssBytes: 1e9, dirs: ["/data", "/tmp"] },
      async () => {
        probes++;
        return free;
      },
      () => rss,
      () => now,
    );
    expect(await g.problem()).toBeNull();
    expect(probes).toBe(2);
    free = 1e9;
    expect(await g.problem()).toBeNull(); // cached
    now += 11_000;
    expect(await g.problem()).toBe("disk");
    rss = 2e9;
    expect(await g.problem()).toBe("memory");
  });
});

describe("defense mode in the error card", () => {
  it("explains and offers to sign in (no auto-retry)", () => {
    const v = describeFailure({ code: "signin_required", message: "Por ahora, entra…", status: 401 });
    expect(v.actions).toEqual(["signin"]);
    expect(v.autoRetrySec).toBeUndefined();
  });
});
