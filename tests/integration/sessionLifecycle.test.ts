import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_TTL_MS } from "../../src/adapters/http/accounts/repo.js";
import { DELETE_ACCOUNT_CONFIRM, type Me } from "../../src/adapters/http/contract.js";
import { type Browser, type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * Sign in → sign out → sign in again, across tabs, browsers and account
 * deletion. The fake bot hands out sealed sessions that remember who they
 * belong to and WHEN they were sealed (iat), like the real one.
 */
const ACC_A = "a".repeat(64);
const ACC_B = "b".repeat(64);

let dir: string;
let h: Harness;
let sealed: Map<string, { account: string; iat: number }>;
let nextLink: { account: string; session: string } = { account: ACC_A, session: "s2.first" };
let seq = 0;

beforeEach(async () => {
  dir = await makeTempDir();
  sealed = new Map();
  seq = 0;
  const bot = {
    status: async () => ({ available: true, connected: false }),
    send: async () => ({ delivered: "sticker" as const }),
    linkStatus: async () => ({ state: "unlinked" as const }),
    unlink: async () => {},
    self: async (path: string, body?: unknown) => {
      if (path === "/link") return { status: 200, body: { id: `L${++seq}` } };
      if (path.startsWith("/link/")) {
        // Sealed «now», like the bot does at the end of a link.
        const iat = h.clock.now;
        sealed.set(nextLink.session, { account: nextLink.account, iat });
        return {
          status: 200,
          body: { state: "linked", session: nextLink.session, account: nextLink.account, phone: "…0000", iat },
        };
      }
      if (path === "/whoami") {
        const s = sealed.get((body as { session: string }).session);
        return s
          ? { status: 200, body: { account: s.account, phone: "…0000", iat: s.iat } }
          : { status: 400, body: { error: "Tu vinculación no es válida", code: "invalid" } };
      }
      if (path === "/logout") return { status: 200, body: { ok: true } };
      return { status: 200, body: { sent: 1, session: "s2.renewed" } };
    },
  };
  h = await makeHarness(dir, undefined, { bot: bot as never });
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});

const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const json = (b: unknown) => ({ method: "POST", body: JSON.stringify(b) });

/** Link in browser `b` (optionally as another account); returns the cookie and the sealed session. */
async function link(b: Browser, account = ACC_A, session = `s2.${b}-${account.slice(0, 1)}-${seq + 1}`) {
  nextLink = { account, session };
  await h.req(b, "/api/self/link", json({}));
  const r = await h.req(b, `/api/self/link/L${seq}`);
  const body = (await r.json()) as { me: Me | null; session: string };
  return { cookie: cookieOf(r), me: body.me, session: body.session };
}
const me = async (b: Browser, cookie: string) =>
  ((await (await h.req(b, "/api/auth/session", { headers: { cookie } })).json()) as { me: Me | null }).me;
const signInAgain = (b: Browser, session: string, cookie = "") =>
  h.req(b, "/api/self/signin", { ...json({ session }), headers: cookie ? { cookie } : {} });
const logout = (b: Browser, cookie: string) => h.req(b, "/api/auth/logout", { method: "POST", headers: { cookie } });
const tick = (ms = 1000) => {
  h.clock.now += ms;
};

describe("sign in, sign out, sign in again", () => {
  it("linking signs in; signing out really signs out (cookie cleared, /me empty)", async () => {
    const a = await link("ana");
    expect(a.me?.handle).toMatch(/^creador_/);
    expect(await me("ana", a.cookie)).toMatchObject({ id: a.me?.id });
    tick();
    const out = await logout("ana", a.cookie);
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(await me("ana", a.cookie)).toBeNull(); // the old cookie is dead too
  });

  it("after signing out, the old sealed session can't sign back in (another tab, a kept copy)", async () => {
    const a = await link("ana");
    tick();
    await logout("ana", a.cookie);
    tick();
    const again = await signInAgain("ana", a.session);
    expect(again.status).toBe(401);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe("session_revoked");
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("linking again after signing out works, and it's the SAME account (profile kept)", async () => {
    const a = await link("ana");
    await h.req("ana", "/api/me", {
      method: "PATCH",
      body: JSON.stringify({ handle: "ana_real" }),
      headers: { cookie: a.cookie },
    });
    tick();
    await logout("ana", a.cookie);
    tick();
    const b = await link("ana");
    expect(b.me?.id).toBe(a.me?.id);
    expect(b.me?.handle).toBe("ana_real");
    expect(await me("ana", b.cookie)).toMatchObject({ handle: "ana_real" });
    // and the new session can sign in again later (not caught by the old revocation)
    const r = await signInAgain("ana", b.session);
    expect(r.status).toBe(200);
  });

  it("sign out → in → out → in, many times: always consistent", async () => {
    let id: string | undefined;
    for (let i = 0; i < 5; i++) {
      tick();
      const s = await link("ana");
      id ??= s.me?.id;
      expect(s.me?.id).toBe(id);
      expect(await me("ana", s.cookie)).not.toBeNull();
      tick();
      await logout("ana", s.cookie);
      expect(await me("ana", s.cookie)).toBeNull();
      expect((await signInAgain("ana", s.session)).status).toBe(401);
    }
  });

  it("a cookie that expired (not a sign-out) is silently renewed from the linked session", async () => {
    const a = await link("ana");
    tick(SESSION_TTL_MS + 86_400_000); // past the cookie session lifetime
    expect(await me("ana", a.cookie)).toBeNull();
    const r = await signInAgain("ana", a.session);
    expect(r.status).toBe(200);
    expect(cookieOf(r)).not.toBe("");
  });

  it("signing out in one browser doesn't sign the same person out elsewhere", async () => {
    const a = await link("ana");
    const b = await link("beto", ACC_A); // same WhatsApp, another browser
    expect(b.me?.id).toBe(a.me?.id);
    tick();
    await logout("ana", a.cookie);
    expect(await me("beto", b.cookie)).not.toBeNull();
    expect((await signInAgain("beto", b.session)).status).toBe(200);
  });

  it("switching accounts on one browser: no trace of the previous one", async () => {
    const a = await link("ana", ACC_A);
    tick();
    await logout("ana", a.cookie);
    tick();
    const b = await link("ana", ACC_B);
    expect(b.me?.id).not.toBe(a.me?.id);
    expect(await me("ana", b.cookie)).toMatchObject({ id: b.me?.id });
    expect(await me("ana", a.cookie)).toBeNull();
  });

  it("signing out without a cookie (already expired) still answers OK and doesn't crash", async () => {
    const r = await h.req("anon", "/api/auth/logout", { method: "POST" });
    expect(r.status).toBe(200);
  });
});

describe("deleting the account", () => {
  it("no linked browser — this one or any other — can silently recreate it", async () => {
    const a = await link("ana");
    const b = await link("beto", ACC_A);
    tick();
    const del = await h.req("ana", "/api/me", {
      method: "DELETE",
      body: JSON.stringify({ confirm: DELETE_ACCOUNT_CONFIRM }),
      headers: { cookie: a.cookie },
    });
    expect(del.status, await del.clone().text()).toBe(200);
    tick();
    expect((await signInAgain("ana", a.session)).status).toBe(401);
    expect((await signInAgain("beto", b.session)).status).toBe(401);
    expect(await h.accounts.byHandle(a.me?.handle as string)).toBeNull();
  });

  it("linking again on purpose afterwards creates a fresh account", async () => {
    const a = await link("ana");
    tick();
    await h.req("ana", "/api/me", {
      method: "DELETE",
      body: JSON.stringify({ confirm: DELETE_ACCOUNT_CONFIRM }),
      headers: { cookie: a.cookie },
    });
    tick();
    const again = await link("ana");
    expect(again.me).not.toBeNull();
    expect(again.me?.id).not.toBe(a.me?.id);
  });
});

describe("defensive edges", () => {
  it("a bot answer without the seal time never signs anyone in", async () => {
    sealed.set("s2.noiat", { account: ACC_A, iat: Number.NaN });
    const r = await signInAgain("ana", "s2.noiat");
    expect(r.status).toBe(401);
  });

  it("a session that doesn't open here is refused and sets no cookie", async () => {
    const r = await signInAgain("ana", "s2.unknown");
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});
