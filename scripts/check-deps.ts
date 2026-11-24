import { ffmpegPath, ffprobePath, run } from "../src/utils/ffmpeg.js";

const REQUIRED_ENCODERS = ["libwebp_anim", "libopus"] as const;

async function main(): Promise<void> {
  let ok = true;
  const ffmpeg = ffmpegPath();
  const ffprobe = ffprobePath();

  for (const [name, bin] of [
    ["ffmpeg", ffmpeg],
    ["ffprobe", ffprobe],
  ] as const) {
    try {
      const { stdout } = await run(bin, ["-version"]);
      console.log(`✔ ${name}: ${stdout.split("\n")[0]} (${bin})`);
    } catch {
      console.error(
        `✘ ${name} not found (${bin}). Install: brew install ffmpeg-full`,
      );
      ok = false;
    }
  }

  if (ok) {
    const { stdout } = await run(ffmpeg, ["-hide_banner", "-encoders"]);
    for (const enc of REQUIRED_ENCODERS) {
      const found = new RegExp(`\\s${enc}\\s`).test(stdout);
      console.log(`${found ? "✔" : "✘"} encoder ${enc}`);
      if (!found) ok = false;
    }
  }

  if (!ok) {
    console.error(
      "\nMissing dependencies. Use `brew install ffmpeg-full` or set FFMPEG_PATH/FFPROBE_PATH.",
    );
    process.exit(1);
  }
  console.log("\nAll dependencies OK.");
}

main();
