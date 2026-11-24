/**
 * Phase-1 manual check: video → animated WebP into samples/output.
 * Usage: npm run try:video -- <input> [startSec] [durationSec] [pad|crop]
 * Full CLI arrives in phase 3.
 */
import { mkdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { STICKER_LIMITS } from "../src/config/limits.js";
import { probe } from "../src/core/probe/probe.js";
import { encodeVideo } from "../src/core/video/encodeVideo.js";
import { resolveSegment } from "../src/core/video/segment.js";
import { inspectWebp, totalDurationMs } from "../src/core/webp/inspect.js";

async function main(): Promise<void> {
  const [
    input,
    start = "0",
    duration = String(STICKER_LIMITS.defaultDurationSec),
    fit = "pad",
  ] = process.argv.slice(2);
  if (!input) {
    console.error(
      "Usage: npm run try:video -- <input> [startSec] [durationSec] [pad|crop]",
    );
    process.exit(1);
  }
  if (fit !== "pad" && fit !== "crop")
    throw new Error(`fit must be pad|crop (got ${fit})`);

  const info = await probe(input);
  console.log("source:", info);
  const seg = resolveSegment(info.durationSec, Number(start), Number(duration));

  const outDir = "samples/output";
  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `${basename(input, extname(input))}.webp`);

  const t0 = performance.now();
  await encodeVideo({ input, output: out, ...seg, fit });
  const ms = performance.now() - t0;

  const webp = inspectWebp(await readFile(out));
  const kb = webp.byteLength / 1024;
  const limitKb = STICKER_LIMITS.maxAnimatedBytes / 1024;
  console.log(`\n✔ ${out}`);
  console.log(
    `  ${webp.canvasWidth}×${webp.canvasHeight}, ${webp.frames.length} frames, ${totalDurationMs(webp)} ms`,
  );
  console.log(
    `  ${kb.toFixed(1)} KB ${kb <= limitKb ? "✔" : `✘ over ${limitKb} KB limit (optimizer = phase 3)`}`,
  );
  console.log(`  encoded in ${(ms / 1000).toFixed(2)} s`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
