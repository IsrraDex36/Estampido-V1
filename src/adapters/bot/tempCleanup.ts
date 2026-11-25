import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Remove `<tmp>/<prefix>*` folders (orphans from a crashed run). Returns how many. */
export async function cleanupTempDirs(prefix: string, root = tmpdir()): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const targets = entries.filter((e) => e.isDirectory() && e.name.startsWith(prefix));
  await Promise.all(targets.map((e) => rm(join(root, e.name), { recursive: true, force: true })));
  return targets.length;
}
