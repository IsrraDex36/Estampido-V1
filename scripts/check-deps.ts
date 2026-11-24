import { checkDeps } from "../src/utils/deps.js";

const checks = await checkDeps();
for (const c of checks) console.log(`${c.ok ? "✔" : "✘"} ${c.name}: ${c.detail}`);
if (checks.some((c) => !c.ok)) {
  console.error("\nFaltan dependencias. Usa `brew install ffmpeg-full` o define FFMPEG_PATH/FFPROBE_PATH.");
  process.exit(1);
}
console.log("\nTodo OK.");
