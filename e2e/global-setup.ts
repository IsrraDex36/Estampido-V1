import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegPath, run } from "../src/utils/ffmpeg.js";

/**
 * Starts the real API and the built web app (vite preview) on dedicated ports,
 * plus a generated test clip. Requires `npm --prefix web run build` first
 * (the npm script does it).
 */
export const API_PORT = 8799;
export const WEB_PORT = 4199;

const children: ChildProcess[] = [];
let workDir = "";

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function start(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string): void {
  // Own process group, so teardown also stops grandchildren (npx → tsx/vite).
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: "ignore", detached: true });
  children.push(child);
}

export async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  workDir = await mkdtemp(join(tmpdir(), "sva-e2e-"));
  const clip = join(workDir, "clip.mp4");
  await run(ffmpegPath(), [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=6",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    clip,
  ]);

  // Isolated auth dir → no control.json → bot reported as off (deterministic).
  const env = { PORT: String(API_PORT), SVA_API_PORT: String(API_PORT), SVA_AUTH_DIR: join(workDir, "auth") };
  start("npx", ["tsx", "src/adapters/http/index.ts"], env);
  start("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], env, "web");
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`);
  await waitFor(`http://127.0.0.1:${WEB_PORT}/`);

  provide("webUrl", `http://127.0.0.1:${WEB_PORT}/`);
  provide("clip", clip);
}

export async function teardown() {
  for (const c of children) {
    try {
      if (c.pid) process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill("SIGTERM");
    }
  }
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
