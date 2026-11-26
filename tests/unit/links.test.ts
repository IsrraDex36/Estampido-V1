import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODE_TTL_MS, extractCode, LinkStore, maskJid, newCode } from "../../src/adapters/bot/links.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
let dir = "";
afterEach(() => (dir ? rm(dir, { recursive: true, force: true }) : undefined));

async function store(now = () => 1_000) {
  dir = await mkdtemp(join(tmpdir(), "sva-links-"));
  return new LinkStore(join(dir, "links", "5210000000000.json"), now);
}

describe("link codes", () => {
  it("format: EST- + 5 unambiguous chars; found inside a greeting, any case", () => {
    expect(newCode()).toMatch(/^EST-[2-9A-HJKMNP-Z]{5}$/);
    expect(extractCode("Hola Estampido, mi código es est-4k7q9 🙂")).toBe("EST-4K7Q9");
    expect(extractCode("EST-4K7Q")).toBeNull(); // too short
    expect(extractCode("EST-0OIL")).toBeNull(); // look-alikes never generated → never matched
    expect(extractCode("nada")).toBeNull();
  });

  it("create → pending → redeem once → linked; persisted with 0600", async () => {
    const s = await store();
    const { code } = s.createCode(A);
    expect(await s.status(A)).toMatchObject({ state: "pending", code });
    expect(await s.redeem(code, "521@s.whatsapp.net", "521")).toEqual({ ok: true, client: A });
    expect(await s.redeem(code, "999@s.whatsapp.net", "999")).toEqual({ ok: false, reason: "unknown" }); // one use
    expect(await s.status(A)).toMatchObject({ state: "linked", jid: "521@s.whatsapp.net" });
    expect(await s.target(A)).toBe("521@s.whatsapp.net");
    const raw = await readFile(s.file, "utf8");
    expect(raw).toContain(A);
    expect(raw).not.toContain("EST-"); // codes are never written
    const fresh = new LinkStore(s.file);
    expect(await fresh.target(A)).toBe("521@s.whatsapp.net");
  });

  it("codes expire; a new code replaces the previous one", async () => {
    let t = 0;
    const s = await store(() => t);
    const first = s.createCode(A).code;
    const second = s.createCode(A).code;
    expect(await s.redeem(first, "j", "x")).toMatchObject({ ok: false });
    t += CODE_TTL_MS + 1;
    expect(await s.redeem(second, "j", "x")).toEqual({ ok: false, reason: "expired" });
    expect(await s.status(A)).toEqual({ state: "unlinked" });
  });

  it("brute force: 5 attempts per sender per 10 min", async () => {
    const s = await store();
    for (let i = 0; i < 5; i++) await s.redeem("EST-ZZZZZ", "j", "attacker");
    s.createCode(B);
    const { code } = s.createCode(A);
    expect(await s.redeem(code, "j", "attacker")).toEqual({ ok: false, reason: "rate_limited" });
    expect(await s.redeem(code, "j", "someone-else")).toMatchObject({ ok: true });
  });

  it("unlink removes the link and any pending code", async () => {
    const s = await store();
    await s.redeem(s.createCode(A).code, "j", "x");
    expect(await s.unlink(A)).toBe(true);
    expect(await s.target(A)).toBeNull();
    expect(await s.unlink(A)).toBe(false);
  });

  it("masks numbers", () => {
    expect(maskJid("5215512345678@s.whatsapp.net")).toBe("…5678");
    expect(maskJid("233500963782695@lid")).toBe("…2695");
  });
});
