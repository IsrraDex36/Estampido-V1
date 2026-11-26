import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountKeyFor, identityJid, loadAccountSecret } from "../../src/adapters/bot/accountKey.js";
import { createControlApp } from "../../src/adapters/bot/control.js";
import { LinkStore } from "../../src/adapters/bot/links.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sva-acct-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const SECRET = Buffer.alloc(32, 7);

describe("account key (who the person is, without revealing the number)", () => {
  it("same number → same key, across devices and chat-id forms", () => {
    const k = accountKeyFor("5215511112222@s.whatsapp.net", SECRET);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(accountKeyFor("5215511112222:12@s.whatsapp.net", SECRET)).toBe(k); // device suffix
    expect(accountKeyFor("5215511113333@s.whatsapp.net", SECRET)).not.toBe(k);
    expect(accountKeyFor("5215511112222@lid", SECRET)).not.toBe(k); // a lid id is another namespace
    expect(accountKeyFor("5215511112222@s.whatsapp.net", Buffer.alloc(32, 8))).not.toBe(k); // needs the secret
    expect(k).not.toContain("5215511112222");
  });

  it("identity prefers the phone jid over an anonymous @lid", () => {
    expect(identityJid("123456@lid", "5215511112222@s.whatsapp.net")).toBe("5215511112222@s.whatsapp.net");
    expect(identityJid("5215511112222@s.whatsapp.net", "123456@lid")).toBe("5215511112222@s.whatsapp.net");
    expect(identityJid("123456@lid", null)).toBe("123456@lid");
    expect(identityJid("5215511112222:3@s.whatsapp.net")).toBe("5215511112222@s.whatsapp.net");
  });

  it("secret: created once (0600), reused, the same for concurrent first starts", async () => {
    const file = join(dir, "data", "account.secret");
    const [a, b, c] = await Promise.all([loadAccountSecret(file), loadAccountSecret(file), loadAccountSecret(file)]);
    expect(a.equals(b) && b.equals(c)).toBe(true);
    expect(a).toHaveLength(32);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await loadAccountSecret(file)).equals(a)).toBe(true);
    expect((await readFile(file, "utf8")).trim()).toBe(a.toString("hex"));
    await writeFile(join(dir, "bad.secret"), "nope");
    await expect(loadAccountSecret(join(dir, "bad.secret"))).rejects.toThrow(/inválido/);
  });
});

describe("control server exposes the account key only to the API", () => {
  const TOKEN = "t".repeat(64);
  const CLIENT = "c".repeat(64);
  it("linked status carries `account` (from the identity jid) + masked phone; never the number", async () => {
    const links = new LinkStore(join(dir, "links.json"));
    await links.redeem(links.createCode(CLIENT).code, "999@lid", "999@lid", "5215511112222@s.whatsapp.net");
    const sock = { user: { id: "525500000001:8@s.whatsapp.net" } } as unknown as WASocket;
    const app = createControlApp({ current: () => sock, links: () => links }, TOKEN, [dir], SECRET);
    const r = (await (
      await app.request(`/links/${CLIENT}`, { headers: { authorization: `Bearer ${TOKEN}` } })
    ).json()) as Record<string, unknown>;
    expect(r).toMatchObject({ state: "linked", account: accountKeyFor("5215511112222@s.whatsapp.net", SECRET) });
    expect(JSON.stringify(r)).not.toContain("5215511112222");
    // Without a secret (old setups) the field is simply absent.
    const noSecret = createControlApp({ current: () => sock, links: () => links }, TOKEN, [dir]);
    const r2 = (await (
      await noSecret.request(`/links/${CLIENT}`, { headers: { authorization: `Bearer ${TOKEN}` } })
    ).json()) as Record<string, unknown>;
    expect(r2).not.toHaveProperty("account");
  });

  it("older links without identity use their chat jid", async () => {
    const links = new LinkStore(join(dir, "links.json"));
    await links.redeem(links.createCode(CLIENT).code, "5215511112222@s.whatsapp.net", "x");
    const st = await links.status(CLIENT);
    expect(st).toMatchObject({ state: "linked", jid: "5215511112222@s.whatsapp.net" });
    expect(st).not.toHaveProperty("identity");
  });
});
