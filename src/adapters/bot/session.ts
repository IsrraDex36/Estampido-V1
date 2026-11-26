import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { controlFile } from "../../config/paths.js";

/**
 * Forget the WhatsApp session (to link again) WITHOUT touching control.json,
 * which lives in the same folder: it's how the web reaches this running bot.
 * Wiping the whole folder left /admin unable to show the new QR until a restart.
 */
export async function wipeSession(dir: string, keep: readonly string[] = [basename(controlFile())]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // nothing there
  }
  await Promise.all(
    entries.filter((name) => !keep.includes(name)).map((name) => rm(join(dir, name), { recursive: true, force: true })),
  );
}
