import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertResultFile, createControlApp, SENDS_PER_MINUTE } from "../../src/adapters/bot/control.js";
import { LinkStore } from "../../src/adapters/bot/links.js";

let base: string;
let results: string;
let outside: string;
const TOKEN = "t".repeat(64);
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "sva-ctl-"));
  results = join(base, "results");
  outside = join(base, "secret.txt");
  await mkdir(join(results, "job"), { recursive: true });
  await writeFile(join(results, "job", "sticker.webp"), "RIFF");
  await writeFile(outside, "private");
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function fakeSock() {
  const sent: { jid: string; content: unknown }[] = [];
  const sock = {
    user: { id: "525500000001:8@s.whatsapp.net" },
    sendMessage: vi.fn(async (jid: string, content: unknown) => {
      sent.push({ jid, content });
      return undefined;
    }),
  } as unknown as WASocket;
  return { sock, sent };
}

describe("assertResultFile", () => {
  it("accepts files under the results root, rejects outside / traversal / symlink escapes", async () => {
    await expect(assertResultFile(join(results, "job", "sticker.webp"), results)).resolves.toContain("sticker.webp");
    await expect(assertResultFile(outside, results)).rejects.toThrow();
    await expect(assertResultFile(join(results, "..", "secret.txt"), results)).rejects.toThrow();
    await symlink(outside, join(results, "job", "link.webp"));
    await expect(assertResultFile(join(results, "job", "link.webp"), results)).rejects.toThrow();
  });
});

describe("assertResultFile: results + community folders", () => {
  it("accepts community stickers/sounds; rejects other files there, wrong types and missing roots are skipped", async () => {
    const community = join(base, "community");
    await mkdir(join(community, "abc"), { recursive: true });
    await writeFile(join(community, "abc", "sticker.webp"), "RIFF");
    await writeFile(join(community, "abc", "sticker.ogg"), "OggS");
    await writeFile(join(community, "index.json"), "[]");
    const roots = [results, community, join(base, "does-not-exist")];
    await expect(assertResultFile(join(community, "abc", "sticker.webp"), roots, /\.webp$/i)).resolves.toContain(
      "sticker.webp",
    );
    await expect(assertResultFile(join(community, "abc", "sticker.ogg"), roots, /\.ogg$/i)).resolves.toContain(
      "sticker.ogg",
    );
    await expect(assertResultFile(join(community, "index.json"), roots, /\.webp$/i)).rejects.toThrow(/type/);
    await writeFile(join(community, "community.db"), "SQLite format 3");
    await expect(assertResultFile(join(community, "community.db"), roots, /\.webp$/i)).rejects.toThrow(/type/);
    await expect(assertResultFile(join(community, "abc", "sticker.webp"), roots, /\.ogg$/i)).rejects.toThrow(/type/);
    await expect(assertResultFile(outside, roots)).rejects.toThrow(/outside/);
    await expect(assertResultFile(join(community, "..", "secret.txt"), roots)).rejects.toThrow();
  });
});

describe("control app", () => {
  const CLIENT = "c".repeat(64);
  const OTHER = "d".repeat(64);
  const USER = "5215511112222@s.whatsapp.net";
  const handle = (sock: WASocket | null, links: LinkStore | null = null) => ({
    current: () => sock,
    links: () => links,
  });
  const webp = () => join(results, "job", "sticker.webp");
  const post = (app: ReturnType<typeof createControlApp>, path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: auth, body: typeof body === "string" ? body : JSON.stringify(body) });

  async function linked() {
    const links = new LinkStore(join(base, "links.json"));
    await links.redeem(links.createCode(CLIENT).code, USER, USER);
    return links;
  }

  it("rejects missing/wrong token", async () => {
    const app = createControlApp(handle(null), TOKEN, results);
    expect((await app.request("/status")).status).toBe(401);
    expect((await app.request("/status", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("status reflects the socket and exposes the bot number (for wa.me)", async () => {
    const { sock } = fakeSock();
    const off = await createControlApp(handle(null), TOKEN, results).request("/status", { headers: auth });
    expect(await off.json()).toMatchObject({ connected: false, botNumber: null });
    const on = await createControlApp(handle(sock), TOKEN, results).request("/status", { headers: auth });
    const onBody = await on.json();
    expect(onBody).toMatchObject({ connected: true, botNumber: "525500000001" });
    // The web estimates long sends (packs) from this budget.
    expect(onBody.pace).toMatchObject({
      perMinute: expect.any(Number),
      perHour: expect.any(Number),
      lastMinute: expect.any(Number),
    });
  });

  it("link lifecycle: create code → pending → (redeemed) linked with masked phone → delete", async () => {
    const { sock } = fakeSock();
    const links = new LinkStore(join(base, "links.json"));
    const app = createControlApp(handle(sock, links), TOKEN, results);
    const created = (await (await post(app, "/links", { client: CLIENT })).json()) as { code: string };
    expect(created.code).toMatch(/^EST-/);
    expect(await (await app.request(`/links/${CLIENT}`, { headers: auth })).json()).toMatchObject({ state: "pending" });
    await links.redeem(created.code, USER, USER);
    const st = (await (await app.request(`/links/${CLIENT}`, { headers: auth })).json()) as Record<string, unknown>;
    expect(st).toMatchObject({ state: "linked", phone: "…2222" });
    expect(JSON.stringify(st)).not.toContain("5215511112222"); // never the full number
    expect(await (await app.request(`/links/${CLIENT}`, { method: "DELETE", headers: auth })).json()).toEqual({
      removed: true,
    });
    expect((await post(app, "/links", { client: "nope" })).status).toBe(400);
    expect((await app.request("/links/nope", { headers: auth })).status).toBe(400);
  });

  it("sends ONLY to the client's linked chat; unlinked → 409; a `to` field is ignored", async () => {
    const { sock, sent } = fakeSock();
    const app = createControlApp(handle(sock, await linked()), TOKEN, results);
    const ok = await post(app, "/send", {
      client: CLIENT,
      webpPath: webp(),
      animated: true,
      to: "1234@s.whatsapp.net",
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ delivered: "sticker" });
    expect(sent.map((s) => s.jid)).toEqual([USER]);
    const nope = await post(app, "/send", { client: OTHER, webpPath: webp(), animated: true });
    expect(nope.status).toBe(409);
    expect(await nope.json()).toMatchObject({ code: "not_linked" });
  });

  it("community stickers can be sent (regression: «Archivo no permitido o inexistente»); other files can't", async () => {
    const { sock, sent } = fakeSock();
    const community = join(base, "community");
    await mkdir(join(community, "abc"), { recursive: true });
    await writeFile(join(community, "abc", "sticker.webp"), "RIFF");
    await writeFile(join(community, "index.json"), "[]");
    const app = createControlApp(handle(sock, await linked()), TOKEN, [results, community]);
    const ok = await post(app, "/send", {
      client: CLIENT,
      webpPath: join(community, "abc", "sticker.webp"),
      animated: false,
    });
    expect(ok.status).toBe(200);
    expect(sent.map((x) => x.jid)).toEqual([USER]);
    const bad = await post(app, "/send", { client: CLIENT, webpPath: join(community, "index.json"), animated: false });
    expect(bad.status).toBe(403);
    expect(((await bad.json()) as { error: string }).error).toMatch(/ya no está disponible/);
    // Default roots = the real results + community folders (both processes share the env).
    const { sendableRoots } = await import("../../src/adapters/bot/control.js");
    expect(sendableRoots()).toHaveLength(2);
  });

  it("owner's local mode: unlinked + fallbackToSelf → the bot's own chat (never without the flag)", async () => {
    const { sock, sent } = fakeSock();
    const app = createControlApp(handle(sock, new LinkStore(join(base, "empty.json"))), TOKEN, results);
    expect((await post(app, "/send", { client: OTHER, webpPath: webp(), animated: true })).status).toBe(409);
    const ok = await post(app, "/send", { client: OTHER, fallbackToSelf: true, webpPath: webp(), animated: true });
    expect(ok.status).toBe(200);
    expect(sent.map((s) => s.jid)).toEqual(["525500000001@s.whatsapp.net"]);
  });

  it(`per-chat limit: ${SENDS_PER_MINUTE}/min → 429`, async () => {
    const { sock } = fakeSock();
    const app = createControlApp(handle(sock, await linked()), TOKEN, results);
    for (let i = 0; i < SENDS_PER_MINUTE; i++) {
      expect((await post(app, "/send", { client: CLIENT, webpPath: webp(), animated: true })).status).toBe(200);
    }
    const limited = await post(app, "/send", { client: CLIENT, webpPath: webp(), animated: true });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  });

  it("accepts long sounds up to the pipeline limit (e.g. 180.0065 s), rejects beyond", async () => {
    const { sock } = fakeSock();
    const app = createControlApp(handle(sock, await linked()), TOKEN, results);
    await writeFile(join(results, "job", "sticker.ogg"), "OggS");
    const body = (sec: number) => ({
      client: CLIENT,
      webpPath: webp(),
      audioPath: join(results, "job", "sticker.ogg"),
      audioDurationSec: sec,
      animated: true,
    });
    // Passes validation (then fails later at upload on the fake socket → 502, not 400).
    expect((await post(app, "/send", body(180.0065))).status).not.toBe(400);
    const tooLong = await post(app, "/send", body(500));
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(await tooLong.json())).toMatch(/audioDurationSec/);
  });

  it("403 for files outside results; 503 when disconnected; 400 bad body", async () => {
    const { sock } = fakeSock();
    const app = createControlApp(handle(sock, await linked()), TOKEN, results);
    expect((await post(app, "/send", { client: CLIENT, webpPath: outside, animated: false })).status).toBe(403);
    expect((await post(app, "/send", "{")).status).toBe(400);
    const off = createControlApp(handle(null), TOKEN, results);
    expect((await post(off, "/send", {})).status).toBe(503);
    expect((await post(off, "/links", { client: CLIENT })).status).toBe(503);
  });
});

describe("control: admin unlink", () => {
  it("calls the bot's unlink; 404 when the bot doesn't support it; needs the token", async () => {
    const results = await mkdtemp(join(tmpdir(), "sva-ctl-"));
    const unlinkBot = vi.fn(async () => {});
    const app = createControlApp({ current: () => null, links: () => null, unlinkBot }, TOKEN, results);
    expect((await app.request("/admin/unlink", { method: "POST" })).status).toBe(401);
    expect((await app.request("/admin/unlink", { method: "POST", headers: auth })).status).toBe(200);
    expect(unlinkBot).toHaveBeenCalledTimes(1);
    const old = createControlApp({ current: () => null, links: () => null }, TOKEN, results);
    expect((await old.request("/admin/unlink", { method: "POST", headers: auth })).status).toBe(404);
    await rm(results, { recursive: true, force: true });
  });
});

describe("control: «Tu propio WhatsApp»", () => {
  const A = "a".repeat(64);
  async function makeApp(overrides: Record<string, unknown> = {}) {
    const { SessionError } = await import("../../src/adapters/bot/selfSession.js");
    const results = await mkdtemp(join(tmpdir(), "sva-self-"));
    const calls: unknown[][] = [];
    const self = {
      startLink: async (...a: unknown[]) => {
        calls.push(["link", ...a]);
        return "link-1";
      },
      linkStatus: (id: string, client: string) =>
        id === "link-1" && client === A ? { state: "code", code: "ABCD-EFGH" } : null,
      sendToSelf: async (...a: unknown[]) => {
        calls.push(["send", ...a]);
        return { result: { sent: 1 }, session: "s2.new" };
      },
      logout: async () => {
        throw new SessionError("gone", "logged_out");
      },
      ...overrides,
    };
    const app = createControlApp({ current: () => null, links: () => null, self: self as never }, TOKEN, results);
    const post = (path: string, body: unknown) =>
      app.request(path, { method: "POST", headers: auth, body: JSON.stringify(body) });
    return { app, post, calls, results, SessionError };
  }

  it("link: needs the browser id; the phone must be plain digits; extra fields refused", async () => {
    const { post, calls, results } = await makeApp();
    expect((await post("/self/link", {})).status).toBe(400);
    expect((await post("/self/link", { client: "x" })).status).toBe(400);
    expect((await post("/self/link", { client: A, phone: "+52 229" })).status).toBe(400);
    expect((await post("/self/link", { client: A, evil: 1 })).status).toBe(400);
    expect(await (await post("/self/link", { client: A, phone: "5212290000000" })).json()).toEqual({ id: "link-1" });
    expect(calls).toEqual([["link", A, "5212290000000"]]);
    await rm(results, { recursive: true, force: true });
  });

  it("link status only for the browser that started it", async () => {
    const { app, results } = await makeApp();
    expect((await app.request(`/self/link/link-1?client=${A}`, { headers: auth })).status).toBe(200);
    expect((await app.request(`/self/link/link-1?client=${"b".repeat(64)}`, { headers: auth })).status).toBe(404);
    expect((await app.request("/self/link/link-1", { headers: auth })).status).toBe(400);
    await rm(results, { recursive: true, force: true });
  });

  it("send: only files inside the result/community folders; never arbitrary server files", async () => {
    const { post, calls, results } = await makeApp();
    for (const webpPath of ["/etc/passwd", "/etc/hosts.webp", `${results}/../../etc/x.webp`, "relative.webp"]) {
      const r = await post("/self/send", {
        client: A,
        session: "s2.xxxxxxxxxx",
        items: [{ webpPath, animated: false }],
      });
      expect(r.status, webpPath).toBe(400);
    }
    expect(calls).toEqual([]);
    // Malformed bodies.
    for (const body of [
      { client: A, session: "s2.xxxxxxxxxx", items: [] },
      { client: A, session: "short", items: [{ webpPath: "/x.webp", animated: true }] },
      {
        client: A,
        session: "s2.xxxxxxxxxx",
        items: [{ webpPath: "/x.webp", animated: true, jid: "otro@s.whatsapp.net" }],
      },
      { session: "s2.xxxxxxxxxx", items: [{ webpPath: "/x.webp", animated: true }] },
    ]) {
      expect((await post("/self/send", body)).status).toBe(400);
    }
    await rm(results, { recursive: true, force: true });
  });

  it("errors map to clear statuses and never echo the session", async () => {
    const { SessionError } = await import("../../src/adapters/bot/selfSession.js");
    const cases: [string, number][] = [
      ["invalid", 400],
      ["expired", 410],
      ["logged_out", 410],
      ["rate_limited", 429],
      ["timeout", 504],
      ["busy", 503],
      ["send_failed", 502],
    ];
    for (const [code, status] of cases) {
      const { post, results } = await makeApp({
        startLink: async () => {
          throw new SessionError("msg", code as never);
        },
      });
      const r = await post("/self/link", { client: A });
      expect(r.status, code).toBe(status);
      expect(await r.json()).toEqual({ error: "msg", code });
      await rm(results, { recursive: true, force: true });
    }
    const { post, results } = await makeApp();
    const out = await post("/self/logout", { client: A, session: "s2.secretsecretsecret" });
    expect(out.status).toBe(410);
    expect(await out.text()).not.toContain("secretsecret");
    await rm(results, { recursive: true, force: true });
  });

  it("a finished link: the API gets the masked number and the SAME account key as the old sign-in — never the number", async () => {
    const { accountKeyFor } = await import("../../src/adapters/bot/accountKey.js");
    const SECRET = Buffer.alloc(32, 7);
    const results = await mkdtemp(join(tmpdir(), "sva-self-"));
    const me = "5212290001234@s.whatsapp.net";
    const self = {
      linkStatus: () => ({ state: "linked", session: "s2.sealed-session", me }),
      whoAmI: (session: string, client: string) => {
        if (session !== "s2.sealed-session" || client !== A) throw new Error("x");
        return me;
      },
    };
    const app = createControlApp(
      { current: () => null, links: () => null, self: self as never },
      TOKEN,
      results,
      SECRET,
    );
    const r = await app.request(`/self/link/L1?client=${A}`, { headers: auth });
    const body = (await r.json()) as Record<string, string>;
    expect(body).toEqual({
      state: "linked",
      session: "s2.sealed-session",
      phone: expect.stringContaining("1234"),
      account: accountKeyFor(me, SECRET),
    });
    expect(JSON.stringify(body)).not.toContain("5212290001234");
    const who = await app.request("/self/whoami", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ client: A, session: "s2.sealed-session" }),
    });
    expect(await who.json()).toMatchObject({ account: accountKeyFor(me, SECRET) });
    const bad = await app.request("/self/whoami", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ client: A, session: "short" }),
    });
    expect(bad.status).toBe(400);
    await rm(results, { recursive: true, force: true });
  });

  it("all self routes need the control token", async () => {
    const { app, results } = await makeApp();
    for (const path of ["/self/link", "/self/send", "/self/logout", "/self/whoami"]) {
      expect((await app.request(path, { method: "POST" })).status).toBe(401);
    }
    await rm(results, { recursive: true, force: true });
  });
});
