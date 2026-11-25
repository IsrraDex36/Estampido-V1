import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { CancelledError } from "../core/errors.js";

/** Homebrew's keg-only build ships libwebp; the plain `ffmpeg` formula does not. */
const FFMPEG_FULL_DIR = "/opt/homebrew/opt/ffmpeg-full/bin";

function resolveBinary(name: "ffmpeg" | "ffprobe", envVar: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const full = `${FFMPEG_FULL_DIR}/${name}`;
  if (existsSync(full)) return full;
  return name;
}

export const ffmpegPath = (): string => resolveBinary("ffmpeg", "FFMPEG_PATH");
export const ffprobePath = (): string => resolveBinary("ffprobe", "FFPROBE_PATH");

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

/**
 * Run a binary without a shell (args are never interpolated into a command
 * string). Rejects with the tail of stderr on non-zero exit or timeout.
 */
export function run(
  bin: string,
  args: readonly string[],
  { timeoutMs = 120_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    // Cancellation kills the process right away (no orphaned ffmpeg burning CPU).
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new CommandError(`Failed to start ${bin}: ${err.message}`, bin, null, ""));
    });
    child.on("close", (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (cancelled) return reject(new CancelledError());
      if (code === 0) return resolve({ stdout, stderr });
      const tail = stderr.trim().split("\n").slice(-5).join("\n");
      const why = exitSignal ? `killed by ${exitSignal}` : `exit code ${code}`;
      reject(new CommandError(`${bin} failed (${why}):\n${tail}`, bin, code, stderr));
    });
  });
}
