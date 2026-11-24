import { describe, expect, it } from "vitest";
import { CommandError, ffmpegPath, run } from "../../src/utils/ffmpeg.js";

describe("run", () => {
  it("returns stdout from ffmpeg -version", async () => {
    const { stdout } = await run(ffmpegPath(), ["-version"]);
    expect(stdout).toMatch(/^ffmpeg version/);
  });

  it("rejects with CommandError on bad args", async () => {
    await expect(run(ffmpegPath(), ["-i", "/nonexistent.mp4"])).rejects.toBeInstanceOf(CommandError);
  });

  it("rejects when binary is missing", async () => {
    await expect(run("definitely-not-a-binary-xyz", [])).rejects.toThrow(/Failed to start/);
  });
});
