import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CODE_TTL_MS, LinkStore, MAX_PENDING } from "../../src/adapters/bot/links.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * «Entrar con WhatsApp» under traffic: thousands of people opening the dialog
 * (each one creates a code and polls its status), codes expiring, a crowd
 * sending codes at the same time, and someone guessing codes.
 */
const client = () => randomBytes(32).toString("hex");

let dir: string;
let now: number;
let store: LinkStore;
beforeEach(async () => {
  dir = await makeTempDir();
  now = 1_000_000;
  store = new LinkStore(join(dir, "links.json"), () => now);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("link codes under traffic", () => {
  it("20 000 people open the dialog: never refused, codes unique, the cap holds, the newest always work", async () => {
    const people = Array.from({ length: 20_000 }, client);
    const codes = new Map<string, string>();
    const t0 = performance.now();
    for (const p of people) {
      codes.set(p, store.createCode(p).code);
      now += 5; // 20k people in ~100 s
    }
    const createMs = performance.now() - t0;
    expect(store.pendingCount).toBe(MAX_PENDING);
    // The last MAX_PENDING people all hold a live, unique code.
    const recent = people.slice(-MAX_PENDING);
    const live = new Set(recent.map((p) => codes.get(p)));
    expect(live.size).toBe(MAX_PENDING);
    const t1 = performance.now();
    for (const p of recent) expect((await store.status(p)).state).toBe("pending");
    const statusMs = performance.now() - t1;
    // The oldest were dropped (they just get a new code when they come back).
    expect((await store.status(people[0] as string)).state).toBe("unlinked");
    // O(1) paths: generous bounds so slow CI never flakes, still catches O(n²).
    expect(createMs).toBeLessThan(2_000);
    expect(statusMs).toBeLessThan(2_000);
  });

  it("one live code per person, however many times they reopen the dialog", async () => {
    const p = client();
    let last = "";
    for (let i = 0; i < 50; i++) last = store.createCode(p).code;
    expect(store.pendingCount).toBe(1);
    expect(await store.status(p)).toMatchObject({ state: "pending", code: last });
  });

  it("codes expire after 10 min and the waiting list empties on its own", async () => {
    for (let i = 0; i < 1_000; i++) store.createCode(client());
    now += CODE_TTL_MS + 1;
    const p = client();
    store.createCode(p);
    expect(store.pendingCount).toBe(1);
  });

  it("a crowd sending codes at once: every link is saved (no lost writes), each code works once", async () => {
    const people = Array.from({ length: 300 }, client);
    const codes = people.map((p) => store.createCode(p).code);
    const results = await Promise.all(
      codes.map((code, i) => store.redeem(code, `52155${String(i).padStart(8, "0")}@s.whatsapp.net`, `sender-${i}`)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const saved = JSON.parse(await readFile(join(dir, "links.json"), "utf8")) as { links: Record<string, unknown> };
    expect(Object.keys(saved.links)).toHaveLength(300);
    // Same code twice at the same time → exactly one wins.
    const p = client();
    const { code } = store.createCode(p);
    const twice = await Promise.all([store.redeem(code, "a@s", "x1"), store.redeem(code, "b@s", "x2")]);
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
  });

  it("guessing codes: 5 tries per sender per 10 min, then refused (even with thousands waiting)", async () => {
    for (let i = 0; i < MAX_PENDING; i++) store.createCode(client());
    const tries = await Promise.all(
      Array.from({ length: 200 }, (_, i) => store.redeem(`EST-${String(i).padStart(5, "2")}`, "evil@s", "attacker")),
    );
    const counted = tries.filter((r) => r.ok || r.reason !== "rate_limited");
    expect(counted.length).toBeLessThanOrEqual(5);
  });
});
