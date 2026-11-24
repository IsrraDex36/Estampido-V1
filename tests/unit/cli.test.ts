import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram, outputName } from "../../src/adapters/cli/program.js";
import type { ConvertOptions, ConvertResult } from "../../src/pipeline/convert.js";

let out: string;
beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), "sva-cli-"));
});
afterEach(async () => {
  await rm(out, { recursive: true, force: true });
});

const fakeResult = (o: ConvertOptions): ConvertResult => ({
  webpPath: join(o.outDir, `${o.name}.webp`),
  audioPath: o.audio === "none" ? undefined : join(o.outDir, `${o.name}.ogg`),
  warnings: ["aviso de prueba"],
  stats: {
    source: {
      durationSec: 7,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
    },
    segment: { startSec: o.startSec ?? 0, durationSec: o.durationSec ?? 5 },
    sticker: {
      bytes: 1024,
      withinLimit: true,
      maxBytes: 512000,
      quality: 75,
      fps: 15,
      frames: 75,
      durationMs: 5000,
      attempts: 1,
      metadata: null,
    },
    audio:
      o.audio === "none"
        ? undefined
        : {
            bytes: 10,
            codec: "opus",
            origin: typeof o.audio === "object" ? "file" : "video",
          },
    elapsedMs: 5,
  },
});

async function runCli(args: string[]) {
  const convert = vi.fn(async (o: ConvertOptions) => fakeResult(o));
  const logs: string[] = [];
  const errors: string[] = [];
  const program = buildProgram("0.0.0-test", {
    convert,
    log: (s) => logs.push(s),
    error: (s) => errors.push(s),
  });
  let exitCode = 0;
  try {
    await program.parseAsync(["node", "sva", ...args]);
  } catch (e) {
    exitCode = (e as { exitCode?: number }).exitCode ?? 1;
  }
  return {
    convert,
    logs: logs.join("\n"),
    errors: errors.join("\n"),
    exitCode,
  };
}

describe("sva convert", () => {
  it("maps flags to pipeline options", async () => {
    const { convert, logs } = await runCli(["convert", "clip.mov", "-s", "1.5", "-d", "3", "--crop", "-o", out]);
    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "clip",
        startSec: 1.5,
        durationSec: 3,
        fit: "crop",
        audio: "source",
        outDir: out,
      }),
    );
    expect(logs).toContain("✔ Sticker:");
    expect(logs).toContain("⚠ aviso de prueba");
  });

  it("--audio file with offset, --no-audio", async () => {
    const a = await runCli(["convert", "v.mp4", "-a", "voz.ogg", "--audio-start", "2", "-o", out]);
    expect(a.convert.mock.calls[0]?.[0].audio).toEqual({
      file: expect.stringMatching(/voz\.ogg$/),
      startSec: 2,
    });
    const b = await runCli(["convert", "v.mp4", "--no-audio", "-o", out]);
    expect(b.convert.mock.calls[0]?.[0].audio).toBe("none");
    expect(b.logs).toContain("Sin audio");
  });

  it("--json prints parseable result", async () => {
    const { logs } = await runCli(["convert", "v.mp4", "--json", "-o", out]);
    expect(JSON.parse(logs).stats.sticker.fps).toBe(15);
  });

  it("rejects invalid duration before converting", async () => {
    const { convert, errors, exitCode } = await runCli(["convert", "v.mp4", "-d", "0", "-o", out]);
    expect(convert).not.toHaveBeenCalled();
    expect(exitCode).not.toBe(0);
    expect(errors).toMatch(/--duration debe ser/);
  });
});

describe("outputName", () => {
  it.each([
    ["/a/b/Mi Video (1).mp4", "Mi_Video_1_"],
    ["../../etc/passwd", "passwd"],
    ["clip", "clip"],
    ["/x/.mp4", ".mp4"],
  ])("%s → %s", (input, expected) => {
    expect(outputName(input)).toBe(expected);
  });
});
