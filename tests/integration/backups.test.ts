import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/adapters/http/app.js";
import { Backups, dayOf, toPrune, weekOf } from "../../src/adapters/http/backups.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

describe("retention (pure)", () => {
  it("weeks start on Monday", () => {
    expect(weekOf("2026-11-26")).toBe("2026-11-23"); // Thursday → Monday
    expect(weekOf("2026-11-23")).toBe("2026-11-23");
    expect(weekOf("2026-11-29")).toBe("2026-11-23"); // Sunday
  });

  it("keeps the last 7 days and one per week for 4 weeks", () => {
    const days = Array.from({ length: 40 }, (_, i) => dayOf(Date.UTC(2026, 10, 30) - i * 86_400_000));
    const pruned = new Set(toPrune(days));
    const kept = days.filter((d) => !pruned.has(d));
    expect(kept.slice(0, 7)).toEqual(days.slice(0, 7)); // last week, every day
    expect(new Set(kept.map(weekOf)).size).toBe(4);
    expect(kept.length).toBeLessThanOrEqual(7 + 4);
    expect(toPrune(["2026-11-01"])).toEqual([]);
  });
});

let dir: string;
let h: Harness;
beforeEach(async () => {
  dir = await makeTempDir();
  h = await makeHarness(dir);
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});

describe("database backups", () => {
  it("a consistent, restorable snapshot with the real data, taken while the app runs", async () => {
    await h.signIn("ana", "ana");
    await h.publish("ana", { title: "Respaldado" });
    const backups = new Backups(join(dir, "backups"), h.community, () => Date.UTC(2026, 10, 26, 3));
    const info = await backups.run();
    expect(info).toMatchObject({ name: "community-2026-11-26.db.gz", day: "2026-11-26" });
    const restored = join(dir, "restored.db");
    await writeFile(restored, gunzipSync(await readFile(join(dir, "backups", info.name))));
    const db = new DatabaseSync(restored, { readOnly: true });
    expect(db.prepare("SELECT title FROM stickers").all()).toEqual([{ title: "Respaldado" }]);
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBeGreaterThan(0);
    db.close();
    // Same day again replaces it; concurrent runs share one.
    const [a, b] = await Promise.all([backups.run(), backups.run()]);
    expect(a).toEqual(b);
    expect((await backups.list()).length).toBe(1);
  });

  it("admin: list, run now, download — owner only; bad names refused", async () => {
    const TOKEN = "t".repeat(32);
    const backups = new Backups(join(dir, "backups"), h.community);
    const app = createApp({
      store: new ResultStore(join(dir, "r")),
      community: h.community,
      accounts: h.accounts,
      adminToken: TOKEN,
      backups,
    });
    const auth = { authorization: `Bearer ${TOKEN}` };
    expect((await app.request("/api/admin/backups")).status).toBe(401);
    expect(await (await app.request("/api/admin/backups", { headers: auth })).json()).toEqual({
      items: [],
      enabled: true,
    });
    const made = (await (await app.request("/api/admin/backups", { method: "POST", headers: auth })).json()) as {
      name: string;
    };
    const dl = await app.request(`/api/admin/backups/${made.name}`, { headers: auth });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/gzip");
    expect(gunzipSync(Buffer.from(await dl.arrayBuffer())).toString("latin1", 0, 15)).toBe("SQLite format 3");
    expect((await app.request(`/api/admin/backups/${made.name}`)).status).toBe(401);
    expect((await app.request("/api/admin/backups/..%2Fcommunity.db", { headers: auth })).status).toBe(404);
  });
});
