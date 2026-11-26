import { join } from "node:path";
import { expect } from "vitest";
import { AccountRepo } from "../../src/adapters/http/accounts/repo.js";
import { type AppDeps, createApp } from "../../src/adapters/http/app.js";
import { clientHash } from "../../src/adapters/http/client.js";
import { CommunityRepo } from "../../src/adapters/http/community/repo.js";
import type { CommunitySticker, Me } from "../../src/adapters/http/contract.js";
import { FeedbackRepo } from "../../src/adapters/http/feedback/repo.js";
import { ModerationRepo } from "../../src/adapters/http/moderation/repo.js";
import { ResultStore } from "../../src/adapters/http/resultStore.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";

/**
 * A full API on a temp dir with a fake bot: browsers (UUIDs) map to WhatsApp
 * accounts, the clock is controllable, admin password set. Shared by the
 * account, trending and moderation suites.
 */
export const ADMIN = "admin-token-0123456789";
export const BROWSERS = {
  ana: "11111111-1111-4111-8111-111111111111",
  beto: "33333333-3333-4333-8333-333333333333",
  caro: "55555555-5555-4555-8555-555555555555",
  dani: "66666666-6666-4666-8666-666666666666",
  anon: "44444444-4444-4444-8444-444444444444", // never linked
} as const;
export type Browser = keyof typeof BROWSERS;

export async function makeHarness(dir: string, start = Date.UTC(2026, 10, 25, 12), extra: Partial<AppDeps> = {}) {
  const clock = { now: start };
  const results = new ResultStore(join(dir, "results"));
  const community = new CommunityRepo(join(dir, "community"), () => clock.now);
  const accounts = new AccountRepo(community, () => clock.now);
  const linked = new Map<string, string>(); // client hash → account key
  for (const [name, id] of Object.entries(BROWSERS)) {
    if (name !== "anon") linked.set(clientHash(id) as string, name.repeat(64).slice(0, 64));
  }
  /** What the fake bot was asked to send (newest last). */
  const sent: { webpPath: string; audioPath?: string }[] = [];
  const bot = {
    status: async () => ({ available: true, connected: true }),
    send: async (req: { webpPath: string; audioPath?: string }) => {
      sent.push({ webpPath: req.webpPath, audioPath: req.audioPath });
      return { delivered: "sticker" as const };
    },
    linkStatus: async (client: string) => {
      const account = linked.get(client);
      return account
        ? { state: "linked" as const, phone: "…0000", linkedAt: 1, account }
        : { state: "unlinked" as const };
    },
    unlink: async (client: string) => void linked.delete(client),
  };
  const app = createApp({
    store: results,
    bot: bot as never,
    community,
    accounts,
    moderation: new ModerationRepo(community, () => clock.now),
    feedback: new FeedbackRepo(community, () => clock.now),
    publishRequiresLink: true,
    adminToken: ADMIN,
    ...extra,
  });

  const headers = (b: Browser, cookie?: string, extra: Record<string, string> = {}) => ({
    "x-estampido-client": BROWSERS[b],
    "content-type": "application/json",
    host: "estampido.test",
    ...(cookie ? { cookie } : {}),
    ...extra,
  });
  const cookies = new Map<Browser, string>();
  const h = {
    app,
    sent,
    clock,
    community,
    accounts,
    /** Request as a browser (with its session cookie if signed in). */
    req: (b: Browser, path: string, init: RequestInit = {}) =>
      app.request(path, {
        ...init,
        headers: { ...headers(b, cookies.get(b)), ...(init.headers as Record<string, string>) },
      }),
    /** Request as nobody (no browser id, no cookie). */
    anonymous: (path: string, init: RequestInit = {}) => app.request(path, init),
    admin: (path: string, init: RequestInit = {}) =>
      app.request(path, {
        ...init,
        headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", ...(init.headers as object) },
      }),
    async signIn(b: Browser, handle?: string): Promise<Me> {
      const r = await app.request("/api/auth/session", { method: "POST", headers: headers(b) });
      expect(r.status, `sign in ${b}`).toBe(200);
      cookies.set(b, (r.headers.get("set-cookie") ?? "").split(";")[0] as string);
      let me = ((await r.json()) as { me: Me }).me;
      if (handle) {
        const p = await h.req(b, "/api/me", { method: "PATCH", body: JSON.stringify({ handle }) });
        me = (await p.json()) as Me;
      }
      return me;
    },
    /** A fresh 30-min result (webp + ogg), like /api/convert leaves. */
    async makeResult(): Promise<string> {
      const job = await results.create();
      const ff = ffmpegPath();
      await run(ff, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=32x32",
        "-frames:v",
        "1",
        join(job.dir, "sticker.webp"),
      ]);
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
      return job.id;
    },
    async publish(b: Browser, extra: Record<string, unknown> = {}): Promise<CommunitySticker> {
      const job = await results.create();
      const ff = ffmpegPath();
      await run(ff, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=32x32",
        "-frames:v",
        "1",
        join(job.dir, "sticker.webp"),
      ]);
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
      const r = await h.req(b, "/api/community/stickers", {
        method: "POST",
        body: JSON.stringify({ resultId: job.id, category: "memes", ownsAudio: true, ...extra }),
      });
      expect(r.status, `publish by ${b}`).toBe(201);
      clock.now += 1000;
      return (await r.json()) as CommunitySticker;
    },
    json: async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T,
    close: () => community.close(),
  };
  return h;
}
export type Harness = Awaited<ReturnType<typeof makeHarness>>;
