import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { wipeSession } from "../../src/adapters/bot/session.js";
import { makeTempDir } from "../helpers/fixtures.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("wipeSession (re-link after «Cerrar sesión» on the phone)", () => {
  it("removes the WhatsApp keys but keeps control.json, so /admin can still reach the bot and show the new QR", async () => {
    await writeFile(join(dir, "creds.json"), "{}");
    await writeFile(join(dir, "pre-key-1.json"), "{}");
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "x.json"), "{}");
    await writeFile(join(dir, "control.json"), '{"port":1,"token":"t"}');
    await wipeSession(dir);
    expect(await readdir(dir)).toEqual(["control.json"]);
  });

  it("missing folder: no error", async () => {
    await expect(wipeSession(join(dir, "nope"))).resolves.toBeUndefined();
  });
});
