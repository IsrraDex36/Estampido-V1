import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setPriority } from "node:os";
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

/**
 * Real media containers only. Never playlists or file-referencing formats
 * (hls, concat, dash, …): a crafted «video» could otherwise make ffmpeg read
 * server files or call URLs. Current ffmpeg refuses those by default; this is
 * defense in depth that doesn't depend on the build.
 */
export const SAFE_FORMATS = [
  "mov,mp4,m4a,3gp,3g2,mj2",
  "matroska,webm",
  "avi",
  "flv",
  "mpegts",
  "mpeg",
  "asf",
  "gif",
  "gif_pipe",
  "webp_pipe",
  "webp_anim",
  "webp",
  "png_pipe",
  "jpeg_pipe",
  "bmp_pipe",
  "tiff_pipe",
  "image2",
  "ogg",
  "mp3",
  "wav",
  "aac",
  "flac",
  "amr",
  "caf",
  "aiff",
  "lavfi",
].join(",");
const INPUT_GUARD = ["-protocol_whitelist", "file,pipe", "-format_whitelist", SAFE_FORMATS];

/**
 * Put the guard in front of every file input (ffmpeg: each `-i` not fed by
 * `-f lavfi`; ffprobe: once, before its input). Pure (tested).
 */
export function hardenArgs(bin: string, args: readonly string[]): string[] {
  const name =
    bin
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.exe$/, "") ?? bin;
  if (name === "ffprobe") return [...INPUT_GUARD, ...args];
  if (name !== "ffmpeg") return [...args];
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    const lavfi = args[i - 2] === "-f" && args[i - 1] === "lavfi";
    if (a === "-i" && !lavfi) {
      // `-f <fmt>` given for this input already pins the demuxer; still forbid network.
      const pinned = args[i - 2] === "-f";
      out.push(...(pinned ? INPUT_GUARD.slice(0, 2) : INPUT_GUARD));
    }
    out.push(a);
  }
  return out;
}

/** Keep only the tail of noisy output (a hostile file can make ffmpeg print a lot). */
const MAX_STDERR = 64 * 1024;
/** stdout carries data (ffprobe JSON): a generous cap, only against abuse. */
const MAX_STDOUT = 8 * 1024 * 1024;
const tail = (s: string, max: number) => (s.length > max ? s.slice(-max) : s);

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
/** 0 (normal) … 19 (lowest). */
const FFMPEG_NICE = Math.min(19, Math.max(0, Number(process.env.SVA_FFMPEG_NICE ?? 10) || 0));

export function run(
  bin: string,
  args: readonly string[],
  { timeoutMs = 120_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const child = spawn(bin, hardenArgs(bin, args), { stdio: ["ignore", "pipe", "pipe"] });
    // Lower CPU priority: under load the web and the API stay snappy while
    // conversions share what's left (SVA_FFMPEG_NICE=0 to disable).
    if (child.pid && FFMPEG_NICE > 0) {
      try {
        setPriority(child.pid, FFMPEG_NICE);
      } catch {
        // not permitted / not supported: run at normal priority
      }
    }
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
      stdout = tail(stdout + d, MAX_STDOUT);
    });
    child.stderr.on("data", (d) => {
      stderr = tail(stderr + d, MAX_STDERR);
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
