import { readFile, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACK_STICKER_PUBLISHER, type PackSummary } from "../../src/adapters/http/contract.js";
import { parseStickerExif } from "../../src/core/metadata/stickerExif.js";
import { readExif } from "../../src/core/webp/chunks.js";
import { type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

/** «Tu propio WhatsApp»: the web routes build what to send and relay the bot's answer. */
type Call = {
  path: string;
  body?: { session?: string; items?: { webpPath: string; audioPath?: string; animated: boolean }[] };
};

let dir: string;
let h: Harness;
let calls: Call[];
let answer: { status: number; body: Record<string, unknown> };
beforeEach(async () => {
  dir = await makeTempDir();
  calls = [];
  answer = { status: 200, body: { sent: 1, session: "s1.refreshed" } };
  const bot = {
    status: async () => ({ available: true, connected: false }),
    send: async () => ({ delivered: "sticker" as const }),
    // Every browser counts as signed in (its own account), so packs can be made.
    linkStatus: async (client: string) => ({ state: "linked" as const, phone: "…0000", linkedAt: 1, account: client }),
    unlink: async () => {},
    self: async (path: string, body?: unknown) => {
      calls.push({ path, body: body as Call["body"] });
      if (path.startsWith("/link/")) return { status: 200, body: { state: "qr", qr: "2@abc,def,ghi,jkl" } };
      if (path === "/link") return { status: 200, body: { id: "L1" } };
      return answer;
    },
  };
  h = await makeHarness(dir, undefined, { bot: bot as never });
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});
const post = (path: string, body: unknown) => h.req("anon", path, { method: "POST", body: JSON.stringify(body) });

describe("send to your own chat", () => {
  it("a fresh result: sticker + sound paths go to the bot with the session; the refreshed session comes back", async () => {
    const id = await h.makeResult();
    const r = await post("/api/self/send", { session: "s1.old", results: [id] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ sent: 1, session: "s1.refreshed" });
    const [call] = calls;
    expect(call?.path).toBe("/send");
    expect(call?.body?.session).toBe("s1.old");
    expect(call?.body?.client).toMatch(/^[0-9a-f]{64}$/); // the browser it's bound to (hashed id, never the raw one)
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(call?.body?.items?.[0]?.webpPath).toMatch(/sticker\.webp$/);
    expect(call?.body?.items?.[0]?.audioPath).toMatch(/sticker\.ogg$/);
  });

  it("a pack: one request for all, each sticker stamped with the pack and the app's mark", async () => {
    await h.signIn("ana", "ana");
    const a = await h.publish("ana", { title: "Uno" });
    const b = await h.publish("ana", { title: "Dos" });
    const pack = await h.json<PackSummary>(
      h.req("ana", "/api/me/packs", { method: "POST", body: JSON.stringify({ name: "Risas", stickerId: a.id }) }),
    );
    await h.req("ana", `/api/me/packs/${pack.id}/stickers/${b.id}`, { method: "PUT" });
    expect((await post("/api/self/send", { session: "s1.x", community: [a.id, b.id], pack: pack.id })).status).toBe(
      200,
    );
    const items = calls[0]?.body?.items ?? [];
    expect(items).toHaveLength(2);
    for (const it of items) {
      const meta = parseStickerExif(readExif(await readFile(it.webpPath)) as Buffer);
      expect(meta).toMatchObject({ packName: "Risas · @ana", publisher: PACK_STICKER_PUBLISHER });
    }
  });

  it("refuses without a session, with nothing to send, expired results; relays WhatsApp errors", async () => {
    expect((await post("/api/self/send", { results: ["x"] })).status).toBe(400);
    expect((await post("/api/self/send", { session: "s1.x", results: [] })).status).toBe(400);
    expect(
      (await post("/api/self/send", { session: "s1.x", results: ["00000000-0000-4000-8000-000000000000"] })).status,
    ).toBe(404);
    answer = {
      status: 410,
      body: { error: "Tu WhatsApp quitó este dispositivo: vincúlalo otra vez.", code: "logged_out" },
    };
    const r = await post("/api/self/send", { session: "s1.x", results: [await h.makeResult()] });
    expect(r.status).toBe(410);
    expect(await r.json()).toMatchObject({ error: { code: "logged_out" } });
  });

  it("linking: start, then the QR comes back as an SVG (never cached)", async () => {
    expect(await (await post("/api/self/link", { phone: "+52 (229) 873-2115" })).json()).toEqual({ id: "L1" });
    expect(calls[0]?.body).toMatchObject({ phone: "522298732115" }); // digits only, used to ask for the code
    expect(calls[0]?.body?.client).toMatch(/^[0-9a-f]{64}$/);
    const st = await h.req("anon", "/api/self/link/L1");
    expect(calls.at(-1)?.path).toMatch(/^\/link\/L1\?client=[0-9a-f]{64}$/);
    expect(st.headers.get("cache-control")).toBe("no-store");
    expect(((await st.json()) as { qrSvg: string }).qrSvg).toMatch(/^<svg/);
  });
});

describe("browser identity is required", () => {
  it("without the browser id header nothing reaches WhatsApp", async () => {
    const id = await h.makeResult();
    for (const [path, body] of [
      ["/api/self/link", {}],
      ["/api/self/send", { session: "s2.x", results: [id] }],
      ["/api/self/logout", { session: "s2.x" }],
    ] as const) {
      const r = await h.anonymous(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(r.status, path).toBe(400);
    }
    expect((await h.anonymous("/api/self/link/L1")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("weird input never becomes a file path", async () => {
    for (const results of [["../../../etc/passwd"], ["%2e%2e/secret"], [""], [42]]) {
      const r = await post("/api/self/send", { session: "s2.x", results });
      expect([400, 404]).toContain(r.status);
    }
    expect(calls).toEqual([]);
  });
});

describe("linking your own WhatsApp signs you in (no bot number involved)", () => {
  const ACCOUNT = "c".repeat(64);
  async function harnessWith(
    linked: Record<string, unknown>,
    whoami: { status: number; body: Record<string, unknown> },
  ) {
    h.close();
    const bot = {
      status: async () => ({ available: true, connected: false }),
      send: async () => ({ delivered: "sticker" as const }),
      linkStatus: async () => ({ state: "unlinked" as const }),
      unlink: async () => {},
      self: async (path: string, body?: unknown) => {
        calls.push({ path, body: body as Call["body"] });
        if (path.startsWith("/link/")) return { status: 200, body: linked };
        if (path === "/whoami") return whoami;
        return { status: 200, body: { id: "L1" } };
      },
    };
    h = await makeHarness(dir, undefined, { bot: bot as never });
  }

  it("the moment the link lands: a session cookie + the profile; the account key never reaches the browser", async () => {
    await harnessWith(
      { state: "linked", session: "s2.sealed", account: ACCOUNT, phone: "…0000" },
      { status: 404, body: {} },
    );
    const r = await h.req("anon", "/api/self/link/L1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { state: string; session: string; me: { handle: string } };
    expect(body.state).toBe("linked");
    expect(body.session).toBe("s2.sealed");
    expect(body.me.handle).toMatch(/^creador_/);
    expect(JSON.stringify(body)).not.toContain(ACCOUNT);
    expect(r.headers.get("set-cookie")).toMatch(/session|sid|est/i);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("the same WhatsApp from another browser = the same account", async () => {
    await harnessWith(
      { state: "linked", session: "s2.a", account: ACCOUNT, phone: "…0000" },
      { status: 404, body: {} },
    );
    const one = (await (await h.req("anon", "/api/self/link/L1")).json()) as { me: { id: string } };
    const two = (await (await h.req("beto", "/api/self/link/L1")).json()) as { me: { id: string } };
    expect(two.me.id).toBe(one.me.id);
  });

  it("a bad or missing account key never creates an account (still linked for sending)", async () => {
    for (const account of [undefined, "nope", "C".repeat(64), `${"c".repeat(63)}'`]) {
      await harnessWith({ state: "linked", session: "s2.x", account, phone: "…0" }, { status: 404, body: {} });
      const r = await h.req("anon", "/api/self/link/L1");
      const body = (await r.json()) as { me: unknown; session: string };
      expect(body.session).toBe("s2.x");
      expect(body.me).toBeNull();
      expect(r.headers.get("set-cookie")).toBeNull();
    }
  });

  it("signed out but still linked: the sealed session signs you in again (bound to this browser)", async () => {
    await harnessWith({ state: "waiting" }, { status: 200, body: { account: ACCOUNT, phone: "…0000" } });
    const r = await h.req("anon", "/api/self/signin", { method: "POST", body: JSON.stringify({ session: "s2.mine" }) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { me: { handle: string } }).me.handle).toMatch(/^creador_/);
    expect(calls.at(-1)).toMatchObject({ path: "/whoami", body: { session: "s2.mine" } });
    expect(calls.at(-1)?.body?.client).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sign-in refusals: no session, no browser id, session that doesn't open here", async () => {
    await harnessWith(
      { state: "waiting" },
      { status: 400, body: { error: "Tu vinculación no es válida", code: "invalid" } },
    );
    expect((await h.req("anon", "/api/self/signin", { method: "POST", body: "{}" })).status).toBe(400);
    expect(
      (
        await h.anonymous("/api/self/signin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: "s2.x" }),
        })
      ).status,
    ).toBe(400);
    const r = await h.req("anon", "/api/self/signin", {
      method: "POST",
      body: JSON.stringify({ session: "s2.stolen" }),
    });
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});
