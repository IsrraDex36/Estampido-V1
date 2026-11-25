import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Where the HTTP API keeps per-job results (also the only files the bot may send). */
export const RESULTS_ROOT = join(tmpdir(), "sva-results");

/** Bot session folder (keys) — also holds the local control endpoint file. */
export const authDir = (): string => resolve(process.env.SVA_AUTH_DIR ?? ".auth");

/** `{ port, token }` written by the bot, read by the API. Inside authDir (0600). */
export const controlFile = (): string => join(authDir(), "control.json");

/** Published community stickers/sounds (persistent, git-ignored). */
export const communityRoot = (): string => resolve(process.env.SVA_COMMUNITY_DIR ?? ".data/community");
