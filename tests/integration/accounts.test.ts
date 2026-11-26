import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountRepo, hashToken, SESSION_TTL_MS } from "../../src/adapters/http/accounts/repo.js";
import { createApp } from "../../src/adapters/http/app.js";
import { MIGRATIONS } from "../../src/adapters/http/community/db.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import {
  type CommunityPage,
  type CommunitySticker,
  type CreatorProfile,
  DELETE_ACCOUNT_CONFIRM,
  type FavoriteIds,
  type Me,
} from "../../src/adapters/http/contract.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeTempDir } from "../helpers/fixtures.js";

/**
 * Accounts end to end through the HTTP API: sign in with a linked WhatsApp,
 * sessions, profiles, creators, synced favorites, own stickers, account
 * deletion, CSRF and privacy. The bot is faked: browser → WhatsApp account.
 */
const DAY = 24 * 3_600_000;
const B1 = "11111111-1111-4111-8111-111111111111"; // browser 1 (Ana)
const B2 = "22222222-2222-4222-8222-222222222222"; // browser 2 (Ana, other device)
const B3 = "33333333-3333-4333-8333-333333333333"; // browser 3 (Beto)
const B4 = "44444444-4444-4444-8444-444444444444"; // browser 4 (not linked)

let dir: string;
let clock: number;
let results: ResultStore;
let community: CommunityRepo;
let accounts: AccountRepo;
let app: ReturnType<typeof createApp>;
let unlinked: string[];
let botDown: boolean;
let botOutdated: boolean;

/** Browser → who is linked there (raw ids are hashed by the API, so map by hash order of calls). */
const linkedAs: Record<string, { account: string; phone: string }> = {};

beforeEach(async () => {
  dir = await makeTempDir();
  clock = Date.UTC(2026, 10, 25, 12);
  results = new ResultStore(join(dir, "results"));
  community = new CommunityRepo(join(dir, "community"), () => clock);
  accounts = new AccountRepo(community, () => clock);
  unlinked = [];
  botDown = false;
  botOutdated = false;
  const { clientHash } = await import("../../src/adapters/http/client.js");
  for (const k of Object.keys(linkedAs)) delete linkedAs[k];
  linkedAs[clientHash(B1) as string] = { account: "a".repeat(64), phone: "…1111" };
  linkedAs[clientHash(B2) as string] = { account: "a".repeat(64), phone: "…1111" };
  linkedAs[clientHash(B3) as string] = { account: "b".repeat(64), phone: "…3333" };
  const bot = {
    status: async () => ({ available: true, connected: true }),
    send: async () => ({ delivered: "sticker" as const }),
    linkStatus: async (client: string) => {
      if (botDown) throw new Error("down");
      const who = linkedAs[client];
      if (!who) return { state: "unlinked" as const };
      return {
        state: "linked" as const,
        phone: who.phone,
        linkedAt: 1,
        ...(botOutdated ? {} : { account: who.account }),
      };
    },
    unlink: async (client: string) => {
      unlinked.push(client);
      delete linkedAs[client];
    },
  };
  app = createApp({ store: results, bot: bot as never, community, accounts, publishRequiresLink: true });
});
afterEach(async () => {
  community.close();
  await rm(dir, { recursive: true, force: true });
});

// ── helpers ────────────────────────────────────────────────────────────────
const H = (browser: string, cookie?: string, extra: Record<string, string> = {}) => ({
  "x-estampido-client": browser,
  "content-type": "application/json",
  host: "estampido.test",
  ...(cookie ? { cookie } : {}),
  ...extra,
});
async function signIn(browser: string): Promise<{ cookie: string; me: Me; created: boolean; setCookie: string }> {
  const res = await app.request("/api/auth/session", { method: "POST", headers: H(browser) });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const body = (await res.json()) as { me: Me; created: boolean };
  return { cookie: setCookie.split(";")[0] as string, setCookie, ...body };
}
const req = (path: string, browser: string, cookie: string | undefined, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { ...H(browser, cookie), ...(init.headers as Record<string, string>) } });
const json = async <T>(r: Response) => (await r.json()) as T;

async function fakeResult(withSound = true): Promise<string> {
  const job = await results.create();
  const ff = ffmpegPath();
  await run(ff, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=64x64",
    "-frames:v",
    "1",
    join(job.dir, "sticker.webp"),
  ]);
  if (withSound) {
    await run(ff, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=1",
      "-c:a",
      "libopus",
      join(job.dir, "sticker.ogg"),
    ]);
  }
  return job.id;
}
async function publish(
  browser: string,
  cookie: string,
  extra: Record<string, unknown> = {},
): Promise<CommunitySticker> {
  const r = await req("/api/community/stickers", browser, cookie, {
    method: "POST",
    body: JSON.stringify({
      resultId: await fakeResult(extra.share !== "sticker"),
      category: "memes",
      ownsAudio: true,
      ...extra,
    }),
  });
  expect(r.status).toBe(201);
  clock += 1000;
  return json<CommunitySticker>(r);
}

// ── sign in ──────────────────────────────────────────────────────────────
describe("sign in with WhatsApp", () => {
  it("needs a browser id (400), a linked WhatsApp (401), a reachable (503) and updated (503) bot", async () => {
    expect((await app.request("/api/auth/session", { method: "POST" })).status).toBe(400);
    const r = await app.request("/api/auth/session", { method: "POST", headers: H(B4) });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: { code: "not_linked" } });
    botDown = true;
    expect((await app.request("/api/auth/session", { method: "POST", headers: H(B1) })).status).toBe(503);
    botDown = false;
    botOutdated = true;
    const old = await app.request("/api/auth/session", { method: "POST", headers: H(B1) });
    expect(old.status).toBe(503);
    expect(await old.json()).toMatchObject({ error: { code: "bot_outdated" } });
  });

  it("creates the account once, sets a safe cookie, and /me answers", async () => {
    const first = await signIn(B1);
    expect(first.created).toBe(true);
    expect(first.me).toMatchObject({ phone: "…1111", bio: "", stats: { stickers: 0, uses: 0, saves: 0, sends: 0 } });
    expect(first.me.handle).toMatch(/^creador_\d{4}$/);
    expect(first.me.avatar).toMatch(/^\S+ (lime|pink|sky|amber|violet|coral)$/u);
    expect(first.setCookie).toMatch(/HttpOnly/i);
    expect(first.setCookie).toMatch(/SameSite=Lax/i);
    expect(first.setCookie).toMatch(/Path=\//);
    expect(first.setCookie).toMatch(/Max-Age=7776000/); // 90 days
    const me = await req("/api/me", B1, first.cookie);
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect((await json<Me>(me)).id).toBe(first.me.id);
    const again = await signIn(B1);
    expect(again.created).toBe(false);
    // One session per browser: signing in again replaces the old one.
    expect((await req("/api/me", B1, first.cookie)).status).toBe(401);
    expect((await req("/api/me", B1, again.cookie)).status).toBe(200);
    expect((await req("/api/me", B1, undefined)).status).toBe(401);
    // «Who am I?» never fails: signed out → { me: null }.
    expect(await json(await req("/api/auth/session", B1, undefined))).toEqual({ me: null });
    expect((await json<{ me: Me }>(await req("/api/auth/session", B1, again.cookie))).me.id).toBe(first.me.id);
  });

  it("production: __Host- cookie with Secure", async () => {
    const secure = createApp({
      store: results,
      bot: {
        status: async () => ({ available: true, connected: true }),
        linkStatus: async () => ({ state: "linked", phone: "…9", linkedAt: 1, account: "c".repeat(64) }),
      } as never,
      community,
      accounts,
      secureCookies: true,
    });
    const r = await secure.request("/api/auth/session", { method: "POST", headers: H(B1) });
    const sc = r.headers.get("set-cookie") ?? "";
    expect(sc).toMatch(/^__Host-estampido=/);
    expect(sc).toMatch(/Secure/);
    expect(sc).not.toMatch(/Domain=/i);
  });

  it("same WhatsApp on two browsers = same account; another number = another account", async () => {
    const a1 = await signIn(B1);
    const a2 = await signIn(B2);
    const b = await signIn(B3);
    expect(a2.me.id).toBe(a1.me.id);
    expect(a2.created).toBe(false);
    expect(b.me.id).not.toBe(a1.me.id);
    expect(a1.cookie).not.toBe(a2.cookie); // one session per browser
  });

  it("10 simultaneous sign-ins of a new number → exactly one account", async () => {
    const all = await Promise.all(Array.from({ length: 10 }, () => signIn(B1)));
    expect(new Set(all.map((x) => x.me.id)).size).toBe(1);
    const db = new DatabaseSync(community.dbPath);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
    db.close();
  });

  it("privacy: the browser never gets the account key; profiles never show the phone", async () => {
    const { cookie, me } = await signIn(B1);
    const link = await json<Record<string, unknown>>(await req("/api/whatsapp/link", B1, cookie));
    expect(link).toEqual({ state: "linked", phone: "…1111", linkedAt: 1 });
    expect(JSON.stringify(me)).not.toContain("a".repeat(64));
    const pub = await json<Record<string, unknown>>(await req(`/api/creators/${me.handle}`, B3, undefined));
    expect(pub).not.toHaveProperty("phone");
    expect(pub).not.toHaveProperty("id");
  });
});

// ── sessions ─────────────────────────────────────────────────────────────
describe("sessions", () => {
  it("stored hashed; a forged or tampered cookie is rejected and cleared", async () => {
    const { cookie } = await signIn(B1);
    const token = cookie.split("=")[1] as string;
    const db = new DatabaseSync(community.dbPath);
    const rows = db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    db.close();
    expect(rows.map((r) => r.token_hash)).toEqual([hashToken(token)]);
    expect(rows[0]?.token_hash).not.toBe(token);
    const bad = await req("/api/me", B1, `estampido_session=${token.slice(0, -2)}xx`);
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toMatch(/estampido_session=;.*Max-Age=0/);
  });

  it("expire after 90 days without use; using it extends it (sliding)", async () => {
    const { cookie } = await signIn(B1);
    clock += 60 * DAY;
    expect((await req("/api/me", B1, cookie)).status).toBe(200); // refreshed → +90 d from now
    clock += 80 * DAY;
    expect((await req("/api/me", B1, cookie)).status).toBe(200);
    clock += 91 * DAY;
    expect((await req("/api/me", B1, cookie)).status).toBe(401);
    expect(await accounts.purgeExpiredSessions()).toBe(0); // the expired one was already dropped on use
  });

  it("purge removes expired sessions nobody used", async () => {
    await signIn(B1);
    await signIn(B3);
    clock += 91 * DAY;
    expect(await accounts.purgeExpiredSessions()).toBe(2);
  });

  it("logout ends the session, unlinks this browser and clears the cookie; other devices stay signed in", async () => {
    const a1 = await signIn(B1);
    const a2 = await signIn(B2);
    const out = await req("/api/auth/logout", B1, a1.cookie, { method: "POST" });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(unlinked).toHaveLength(1);
    expect((await req("/api/me", B1, a1.cookie)).status).toBe(401);
    expect((await req("/api/me", B2, a2.cookie)).status).toBe(200);
    // Signing in again needs a new link (the browser was unlinked).
    expect((await app.request("/api/auth/session", { method: "POST", headers: H(B1) })).status).toBe(401);
  });

  it("unlinking WhatsApp from the browser also signs it out", async () => {
    const { cookie } = await signIn(B1);
    expect((await req("/api/whatsapp/link", B1, cookie, { method: "DELETE" })).status).toBe(200);
    expect((await req("/api/me", B1, cookie)).status).toBe(401);
  });

  it("CSRF: cookie writes from another origin are refused; same origin and no-Origin clients pass", async () => {
    const { cookie } = await signIn(B1);
    const evil = await req("/api/me", B1, cookie, {
      method: "PATCH",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ bio: "pwned" }),
    });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toMatchObject({ error: { code: "bad_origin" } });
    const same = await req("/api/me", B1, cookie, {
      method: "PATCH",
      headers: { origin: "https://estampido.test" },
      body: JSON.stringify({ bio: "hola" }),
    });
    expect(same.status).toBe(200);
    expect((await req("/api/me", B1, cookie, { method: "PATCH", body: JSON.stringify({ bio: "x" }) })).status).toBe(
      200,
    );
    expect((await req("/api/auth/logout", B1, cookie, { method: "POST", headers: { origin: "null" } })).status).toBe(
      403,
    );
  });
  it("CSRF check only guards cookie writes; localhost origins only in development", async () => {
    // No session cookie → nothing to forge → a cross-origin write is just an anonymous request.
    const anon = await req("/api/auth/logout", B4, undefined, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(anon.status).toBe(200);
    // Dev (Vite proxy on another port): a localhost origin is fine.
    const { cookie } = await signIn(B1);
    const dev = await req("/api/me", B1, cookie, {
      method: "PATCH",
      headers: { origin: "http://localhost:5173" },
      body: JSON.stringify({ bio: "dev" }),
    });
    expect(dev.status).toBe(200);
    // Production: only the site's own origin.
    const prod = createApp({
      store: results,
      bot: { linkStatus: async () => ({ state: "unlinked" }) } as never,
      community,
      accounts,
      secureCookies: true,
    });
    const token = cookie.split("=")[1] as string;
    const r = await prod.request("/api/me", {
      method: "PATCH",
      headers: { ...H(B1, `__Host-estampido=${token}`), origin: "http://localhost:5173" },
      body: JSON.stringify({ bio: "x" }),
    });
    expect(r.status).toBe(403);
  });
});

// ── profile ──────────────────────────────────────────────────────────────
describe("profile", () => {
  const patch = (cookie: string, body: unknown) =>
    req("/api/me", B1, cookie, { method: "PATCH", body: JSON.stringify(body) });

  it("edits handle (normalized), name, bio and avatar", async () => {
    const { cookie } = await signIn(B1);
    const r = await patch(cookie, {
      handle: "  Ana_Memes ",
      displayName: "Ana  ",
      bio: "Hago\n\n\n\nmemes",
      avatar: "🦊 pink",
    });
    expect(r.status).toBe(200);
    expect(await json<Me>(r)).toMatchObject({
      handle: "ana_memes",
      displayName: "Ana",
      bio: "Hago\n\nmemes",
      avatar: "🦊 pink",
    });
    const pub = await json<CreatorProfile>(await app.request("/api/creators/ANA_MEMES"));
    expect(pub).toMatchObject({ handle: "ana_memes", displayName: "Ana" });
  });

  it("validates every field and rejects unknown ones", async () => {
    const { cookie } = await signIn(B1);
    for (const body of [
      { handle: "ab" },
      { handle: "a".repeat(21) },
      { handle: "con espacio" },
      { handle: "ñandú" },
      { displayName: "" },
      { displayName: "\u0000\u0007" },
      { displayName: "x".repeat(41) },
      { bio: "x".repeat(161) },
      { avatar: "💩 lime" },
      { avatar: "🦊 black" },
      { avatar: "🦊 pink extra" },
      { isAdmin: true },
      "nope",
    ]) {
      expect((await patch(cookie, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await json<Me>(await patch(cookie, { displayName: "Ana\u0000\u001b[31m" }))).displayName).toBe("Ana[31m");
  });

  it("handles are unique (case-insensitive) and some are reserved", async () => {
    const a = await signIn(B1);
    const b = await signIn(B3);
    expect((await patch(a.cookie, { handle: "pum_fan" })).status).toBe(200);
    const taken = await req("/api/me", B3, b.cookie, { method: "PATCH", body: JSON.stringify({ handle: "PUM_FAN" }) });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: { code: "handle_taken" } });
    for (const handle of ["admin", "estampido", "whatsapp", "pum"]) {
      expect((await patch(a.cookie, { handle })).status, handle).toBe(409);
    }
  });

  it("everything under /me needs a session", async () => {
    for (const [path, method] of [
      ["/api/me", "GET"],
      ["/api/me", "PATCH"],
      ["/api/me", "DELETE"],
      ["/api/me/stickers", "GET"],
      ["/api/me/stickers/00000000-0000-4000-8000-000000000000", "DELETE"],
      ["/api/me/favorites/ids", "GET"],
      ["/api/me/favorites", "GET"],
      ["/api/me/favorites/sticker/00000000-0000-4000-8000-000000000000", "PUT"],
      ["/api/me/favorites/import", "POST"],
    ] as const) {
      const r = await req(path, B1, undefined, { method, body: method === "GET" ? undefined : "{}" });
      expect(r.status, `${method} ${path}`).toBe(401);
    }
  });
});

// ── creators & own stickers ──────────────────────────────────────────────
describe("creators and my stickers", () => {
  it("published stickers carry their creator everywhere; profile + stats + page", async () => {
    const ana = await signIn(B1);
    await req("/api/me", B1, ana.cookie, {
      method: "PATCH",
      body: JSON.stringify({ handle: "ana", displayName: "Ana" }),
    });
    const s1 = await publish(B1, ana.cookie, { title: "Uno" });
    const s2 = await publish(B1, ana.cookie, { title: "Solo sonido", share: "sound" });
    expect(s1.creator).toEqual({ handle: "ana", displayName: "Ana", avatar: expect.any(String) });

    const feed = await json<CommunityPage<CommunitySticker>>(await app.request("/api/community/stickers?sort=new"));
    expect(feed.items.map((s) => [s.title, s.creator?.handle])).toEqual([["Uno", "ana"]]);

    const page = await json<CommunityPage<CommunitySticker>>(await app.request("/api/creators/ana/stickers"));
    expect(page.items.map((s) => s.id)).toEqual([s1.id]); // public page: listed only
    const mine = await json<CommunityPage<CommunitySticker>>(await req("/api/me/stickers", B1, ana.cookie));
    expect(mine.items.map((s) => s.id)).toEqual([s2.id, s1.id]); // mine: everything, newest first

    await app.request(`/api/community/sounds/${s2.id}/use`, { method: "POST", headers: H(B3) });
    const prof = await json<CreatorProfile>(await app.request("/api/creators/ana"));
    expect(prof.stats).toEqual({ stickers: 2, uses: 1, saves: 0, sends: 0 });
    expect((await app.request("/api/creators/nadie")).status).toBe(404);
    expect((await app.request("/api/creators/..%2Fetc")).status).toBe(404);
  });

  it("paginates a creator's stickers without repeats", async () => {
    const ana = await signIn(B1);
    const ids = [];
    for (let i = 0; i < 7; i++) ids.unshift((await publish(B1, ana.cookie, { title: `S${i}` })).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const r: CommunityPage<CommunitySticker> = await json(
        await req(`/api/me/stickers?limit=3${cursor ? `&cursor=${cursor}` : ""}`, B1, ana.cookie),
      );
      seen.push(...r.items.map((s) => s.id));
      cursor = r.nextCursor;
    } while (cursor);
    expect(seen).toEqual(ids);
  });

  it("I can delete my sticker, not someone else's", async () => {
    const ana = await signIn(B1);
    const beto = await signIn(B3);
    const s = await publish(B1, ana.cookie);
    expect((await req(`/api/me/stickers/${s.id}`, B3, beto.cookie, { method: "DELETE" })).status).toBe(404);
    expect((await req(`/api/me/stickers/${s.id}`, B1, ana.cookie, { method: "DELETE" })).status).toBe(200);
    expect((await app.request(`/api/community/sounds/${s.id}`)).status).toBe(404);
    expect(await readdir(join(dir, "community"))).not.toContain(s.id);
  });

  it("top creators: ranked by how much the community uses them; nobody without public stickers", async () => {
    const ana = await signIn(B1);
    const beto = await signIn(B3);
    await req("/api/me", B1, ana.cookie, { method: "PATCH", body: JSON.stringify({ handle: "ana" }) });
    await req("/api/me", B3, beto.cookie, { method: "PATCH", body: JSON.stringify({ handle: "beto" }) });
    expect((await json<{ items: CreatorProfile[] }>(await app.request("/api/creators"))).items).toEqual([]);
    const a = await publish(B1, ana.cookie);
    await publish(B3, beto.cookie);
    await publish(B3, beto.cookie);
    let top = await json<{ items: CreatorProfile[] }>(await app.request("/api/creators"));
    expect(top.items.map((c) => c.handle)).toEqual(["beto", "ana"]); // 2 stickers > 1
    await app.request(`/api/community/sounds/${a.id}/use`, { method: "POST", headers: H(B4) });
    top = await json(await app.request("/api/creators"));
    expect(top.items.map((c) => c.handle)).toEqual(["ana", "beto"]); // a reuse (×3) beats a sticker
  });
});

// ── favorites ────────────────────────────────────────────────────────────
describe("synced favorites", () => {
  it("save/unsave is idempotent and keeps an exact saves counter", async () => {
    const ana = await signIn(B1);
    const beto = await signIn(B3);
    const s = await publish(B1, ana.cookie);
    const put = (b: string, c: string) => req(`/api/me/favorites/sticker/${s.id}`, b, c, { method: "PUT" });
    expect(await json(await put(B1, ana.cookie))).toEqual({ saved: true, saves: 1 });
    expect(await json(await put(B1, ana.cookie))).toEqual({ saved: true, saves: 1 });
    expect(await json(await put(B3, beto.cookie))).toEqual({ saved: true, saves: 2 });
    const del = await req(`/api/me/favorites/sticker/${s.id}`, B1, ana.cookie, { method: "DELETE" });
    expect(await json(del)).toEqual({ saved: false, saves: 1 });
    const again = await req(`/api/me/favorites/sticker/${s.id}`, B1, ana.cookie, { method: "DELETE" });
    expect(await json(again)).toEqual({ saved: false, saves: 1 });
    const feed = await json<CommunityPage<CommunitySticker>>(await app.request("/api/community/stickers"));
    expect(feed.items[0]?.saves).toBe(1);
  });

  it("sticker vs sound shelves; a silent sticker can't be a saved sound; unknown → 404", async () => {
    const ana = await signIn(B1);
    const loud = await publish(B1, ana.cookie);
    const quiet = await publish(B1, ana.cookie, { share: "sticker" });
    const fav = (kind: string, id: string) => {
      clock += 1; // distinct save times → deterministic «newest first»
      return req(`/api/me/favorites/${kind}/${id}`, B1, ana.cookie, { method: "PUT" });
    };
    expect((await fav("sticker", loud.id)).status).toBe(200);
    expect((await fav("sound", loud.id)).status).toBe(200);
    expect((await fav("sticker", quiet.id)).status).toBe(200);
    expect((await fav("sound", quiet.id)).status).toBe(404);
    expect((await fav("sticker", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await fav("pack", loud.id)).status).toBe(400);
    const ids = await json<FavoriteIds>(await req("/api/me/favorites/ids", B1, ana.cookie));
    expect(ids).toEqual({ stickers: [quiet.id, loud.id], sounds: [loud.id] });
    const sounds = await json<{ items: { id: string }[] }>(await req("/api/me/favorites?kind=sound", B1, ana.cookie));
    expect(sounds.items.map((x) => x.id)).toEqual([loud.id]);
    const stickers = await json<{ items: CommunitySticker[] }>(await req("/api/me/favorites", B1, ana.cookie));
    expect(stickers.items.map((x) => x.id)).toEqual([quiet.id, loud.id]);
  });

  it("deleting a sticker removes it from everyone's favorites", async () => {
    const ana = await signIn(B1);
    const beto = await signIn(B3);
    const s = await publish(B1, ana.cookie);
    await req(`/api/me/favorites/sticker/${s.id}`, B3, beto.cookie, { method: "PUT" });
    await req(`/api/me/stickers/${s.id}`, B1, ana.cookie, { method: "DELETE" });
    expect(await json(await req("/api/me/favorites/ids", B3, beto.cookie))).toEqual({ stickers: [], sounds: [] });
  });

  it("import merges device favorites: keeps order, skips unknown/duplicates, counts saves", async () => {
    const ana = await signIn(B1);
    const beto = await signIn(B3);
    const s1 = await publish(B1, ana.cookie);
    const s2 = await publish(B1, ana.cookie);
    await req(`/api/me/favorites/sticker/${s1.id}`, B3, beto.cookie, { method: "PUT" });
    const r = await req("/api/me/favorites/import", B3, beto.cookie, {
      method: "POST",
      body: JSON.stringify({
        items: [
          { id: s2.id, kind: "sticker" },
          { id: s1.id, kind: "sticker" }, // already saved
          { id: "00000000-0000-4000-8000-000000000000", kind: "sticker" },
          { id: "../../etc/passwd", kind: "sticker" },
          { id: s2.id, kind: "sound" },
        ],
      }),
    });
    expect(r.status).toBe(200);
    const body = await json<FavoriteIds & { added: number }>(r);
    expect(body.added).toBe(2);
    expect(body.sounds).toEqual([s2.id]);
    expect(body.stickers).toContain(s2.id);
    expect((await community.get(s2.id))?.saves).toBe(2);
    expect((await community.get(s1.id))?.saves).toBe(1);
    const tooMany = await req("/api/me/favorites/import", B3, beto.cookie, {
      method: "POST",
      body: JSON.stringify({ items: Array.from({ length: 401 }, () => ({ id: s1.id, kind: "sticker" })) }),
    });
    expect(tooMany.status).toBe(400);
  });

  it("each shelf keeps the newest 200", async () => {
    const ana = await signIn(B1);
    const db = await community.connection();
    const insert = db.prepare(
      "INSERT INTO stickers (id, title, category, search, created_at, animated) VALUES (?, 'x', 'memes', 'x', ?, 0)",
    );
    const ids = Array.from({ length: 205 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    for (const [i, id] of ids.entries()) insert.run(id, i);
    for (const id of ids) {
      clock += 1;
      await req(`/api/me/favorites/sticker/${id}`, B1, ana.cookie, { method: "PUT" });
    }
    const saved = await json<FavoriteIds>(await req("/api/me/favorites/ids", B1, ana.cookie));
    expect(saved.stickers).toHaveLength(200);
    expect(saved.stickers[0]).toBe(ids.at(-1));
    expect(saved.stickers).not.toContain(ids[0]);
    expect((await community.get(ids[0] as string))?.saves).toBe(0); // the dropped ones lose their save
  });
});

// ── delete account ───────────────────────────────────────────────────────
describe("delete account", () => {
  it("needs the exact confirmation; removes everything I published, my sessions and my saves", async () => {
    const ana = await signIn(B1);
    const ana2 = await signIn(B2);
    const beto = await signIn(B3);
    const mine = await publish(B1, ana.cookie);
    const his = await publish(B3, beto.cookie);
    await req(`/api/me/favorites/sticker/${his.id}`, B1, ana.cookie, { method: "PUT" });
    await req(`/api/me/favorites/sticker/${mine.id}`, B3, beto.cookie, { method: "PUT" });
    expect((await community.get(his.id))?.saves).toBe(1);

    for (const body of [undefined, {}, { confirm: "borrar mi cuenta" }]) {
      const r = await req("/api/me", B1, ana.cookie, {
        method: "DELETE",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(r.status).toBe(400);
    }
    const r = await req("/api/me", B1, ana.cookie, {
      method: "DELETE",
      body: JSON.stringify({ confirm: DELETE_ACCOUNT_CONFIRM }),
    });
    expect(await json(r)).toEqual({ removed: 1 });
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);

    expect(await community.get(mine.id)).toBeNull();
    expect(await readdir(join(dir, "community"))).not.toContain(mine.id);
    expect((await community.get(his.id))?.saves).toBe(0); // her save is gone with her
    expect((await req("/api/me", B2, ana2.cookie)).status).toBe(401); // every device signed out
    expect(await json(await req("/api/me/favorites/ids", B3, beto.cookie))).toEqual({ stickers: [], sounds: [] });
    // Linking again later starts a brand-new account.
    linkedAs[(await import("../../src/adapters/http/client.js")).clientHash(B1) as string] = {
      account: "a".repeat(64),
      phone: "…1111",
    };
    const again = await signIn(B1);
    expect(again.created).toBe(true);
    expect(again.me.id).not.toBe(ana.me.id);
  });
});

// ── schema migration ─────────────────────────────────────────────────────
describe("database upgrade v1 → v2", () => {
  it("an existing community database gains accounts without losing stickers", async () => {
    const root = join(dir, "old");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(root, { recursive: true });
    const db = new DatabaseSync(join(root, "community.db"));
    db.exec(MIGRATIONS[0] as string);
    db.exec("PRAGMA user_version = 1");
    db.prepare(
      "INSERT INTO stickers (id, title, category, search, created_at, uses, animated, sound_sec) VALUES (?, 'Viejo', 'memes', 'viejo', 1, 3, 1, 2)",
    ).run("00000000-0000-4000-8000-000000000001");
    db.close();

    const repo = new CommunityRepo(root);
    const old = await repo.get("00000000-0000-4000-8000-000000000001");
    expect(old).toMatchObject({ title: "Viejo", uses: 3, ownerId: null, saves: 0, creator: null });
    const conn = await repo.connection();
    expect(conn.prepare("PRAGMA user_version").get()).toEqual({ user_version: MIGRATIONS.length });
    expect(conn.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(conn.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    repo.close();
  });
});

describe("session cost", () => {
  it("resolving a session is a single indexed lookup (fast)", async () => {
    const { cookie } = await signIn(B1);
    const t = performance.now();
    for (let i = 0; i < 200; i++) await req("/api/me", B1, cookie);
    expect((performance.now() - t) / 200).toBeLessThan(5);
    expect(SESSION_TTL_MS).toBe(90 * DAY);
  });
});
