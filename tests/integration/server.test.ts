import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clientIp,
  createServerApp,
  inlineScriptHashes,
  parseLimits,
  resolveStatic,
} from "../../src/adapters/http/server.js";

let dist = "";
const THEME = "\n      var t = 1;\n    ";
beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), "sva-dist-"));
  await mkdir(join(dist, "assets"));
  await writeFile(
    join(dist, "index.html"),
    `<!doctype html><html><head><script>${THEME}</script></head><body><div id="root"></div><script type="module" src="/assets/app-abc.js"></script></body></html>`,
  );
  await writeFile(join(dist, "assets", "app-abc.js"), "console.log(1)");
  await writeFile(join(dist, "favicon.svg"), "<svg/>");
  await writeFile(join(dist, ".env"), "SECRET=1");
});
afterAll(() => rm(dist, { recursive: true, force: true }));

const api = () => {
  const a = new Hono().basePath("/api");
  a.get("/health", (c) => c.json({ ok: true }));
  a.post("/convert", (c) => c.json({ ok: true }));
  a.notFound((c) => c.json({ error: { code: "not_found", message: "x" } }, 404));
  return a;
};
const ip = (addr: string) => ({ "cf-connecting-ip": addr });

describe("production server", () => {
  it("serves the SPA: assets cached forever, routes → index.html (no-cache), missing asset 404", async () => {
    const app = createServerApp({ api: api(), webDist: dist, trustProxy: true });
    const asset = await app.request("/assets/app-abc.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toMatch(/immutable/);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
    for (const route of ["/", "/comunidad", "/privacidad", "/no/existe"]) {
      const r = await app.request(route);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(await r.text()).toContain('<div id="root">');
    }
    expect((await app.request("/assets/missing.js")).status).toBe(404);
    expect((await app.request("/api/nope")).status).toBe(404); // API 404 stays JSON, not the SPA
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("never serves files outside dist or dotfiles", async () => {
    const app = createServerApp({ api: api(), webDist: dist });
    for (const p of ["/.env", "/%2e%2e/%2e%2e/etc/passwd", "/..%2f..%2fetc/passwd", "/assets/%00x.js"]) {
      const body = await (await app.request(p)).text();
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain("root:");
    }
    expect(resolveStatic(dist, "/../../etc/passwd")).toBeNull();
    expect(resolveStatic(dist, "/%E0%A4%A")).toBeNull();
    expect(resolveStatic(dist, "/.git/config")).toBeNull();
  });

  it("security headers everywhere; CSP on HTML with the inline script's hash (no unsafe-inline scripts)", async () => {
    const app = createServerApp({ api: api(), webDist: dist, trustProxy: true });
    const r = await app.request("/", { headers: { "x-forwarded-proto": "https" } });
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain(inlineScriptHashes(`<script>${THEME}</script>`)[0]);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("permissions-policy")).toMatch(/microphone=\(self\)/);
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age/);
    const j = await app.request("/api/health");
    expect(j.headers.get("x-content-type-options")).toBe("nosniff");
    expect(j.headers.get("content-security-policy")).toBeNull();
  });

  it("per-IP rate limits (by real IP behind the tunnel), 429 JSON + Retry-After", async () => {
    const app = createServerApp({ api: api(), trustProxy: true, limits: { convert: { max: 2, windowMs: 60_000 } } });
    const hit = (addr: string) => app.request("/api/convert", { method: "POST", headers: ip(addr) });
    expect((await hit("1.1.1.1")).status).toBe(200);
    expect((await hit("1.1.1.1")).status).toBe(200);
    const limited = await hit("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect((await hit("2.2.2.2")).status).toBe(200); // other people unaffected
  });

  it("proxy headers are ignored unless trusted (no spoofing on a direct connection)", async () => {
    const app = createServerApp({ api: api(), trustProxy: false, limits: { convert: { max: 1, windowMs: 60_000 } } });
    expect((await app.request("/api/convert", { method: "POST", headers: ip("1.1.1.1") })).status).toBe(200);
    // A different spoofed IP doesn't buy a fresh quota.
    expect((await app.request("/api/convert", { method: "POST", headers: ip("9.9.9.9") })).status).toBe(429);
    // X-Forwarded-For: the proxy appends the real IP → rightmost wins; a forged left entry is ignored.
    const c = { req: { header: (h: string) => (h === "x-forwarded-for" ? "6.6.6.6, 3.3.3.3" : undefined) } } as never;
    expect(clientIp(c, true)).toBe("3.3.3.3");
  });
});

describe("rate-limit tuning", () => {
  it("/admin: polling with the right password is never limited; only wrong passwords count", async () => {
    const a = new Hono().basePath("/api");
    a.get("/admin/x", (c) => (c.req.header("authorization") === "Bearer ok" ? c.json({ ok: true }) : c.json({}, 401)));
    const app = createServerApp({ api: a, trustProxy: true, limits: { adminFail: { max: 2, windowMs: 60_000 } } });
    const hit = (auth: string) =>
      app.request("/api/admin/x", { headers: { ...ip("5.5.5.5"), authorization: `Bearer ${auth}` } });
    for (let i = 0; i < 50; i++) expect((await hit("ok")).status).toBe(200);
    expect((await hit("bad")).status).toBe(401);
    expect((await hit("bad")).status).toBe(401);
    expect((await hit("bad")).status).toBe(429); // 2 wrong → locked
    expect((await hit("ok")).status).toBe(429); // even the right one waits (brute-force lockout)
  });

  it("SVA_LIMITS parser", () => {
    const { limits, ignored } = parseLimits(
      "convert=100/5m, send=200/1h,api=5000/10m,nope=1/1m,convert=bad,publish=0/1m",
    );
    expect(limits).toEqual({
      convert: { max: 100, windowMs: 5 * 60_000 },
      send: { max: 200, windowMs: 60 * 60_000 },
      api: { max: 5000, windowMs: 10 * 60_000 },
    });
    expect(ignored).toEqual(["nope=1/1m", "convert=bad", "publish=0/1m"]);
    expect(parseLimits(undefined)).toEqual({ limits: {}, ignored: [] });
  });
});
