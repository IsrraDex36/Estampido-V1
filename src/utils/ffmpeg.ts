import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

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
export const ffprobePath = (): string =>
  resolveBinary("ffprobe", "FFPROBE_PATH");

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
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      reject(
        new CommandError(
          `Failed to start ${bin}: ${err.message}`,
          bin,
          null,
          "",
        ),
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const tail = stderr.trim().split("\n").slice(-5).join("\n");
      const why = signal ? `killed by ${signal}` : `exit code ${code}`;
      reject(
        new CommandError(`${bin} failed (${why}):\n${tail}`, bin, code, stderr),
      );
    });
  });
}
