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
  waitText,
} from "../../src/adapters/http/server.js";
import { DEFAULT_SHIELD, Shield } from "../../src/adapters/http/shield.js";

let dist = "";
const THEME = "\n      var t = 1;\n    ";
beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), "sva-dist-"));
  await mkdir(join(dist, "assets"));
  await writeFile(
    join(dist, "index.html"),
    `<!doctype html><html><head><!--seo:start--><title>dev</title><!--seo:end--><script>${THEME}</script></head><body><div id="root"></div><script type="module" src="/assets/app-abc.js"></script></body></html>`,
  );
  await writeFile(join(dist, "assets", "app-abc.js"), "console.log(1)");
  await writeFile(join(dist, "favicon.svg"), "<svg/>");
  await writeFile(join(dist, "sw.js"), "self.addEventListener('fetch', () => {});");
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
// The proxy (Traefik) appends the real client IP to X-Forwarded-For.
const ip = (addr: string) => ({ "x-forwarded-for": addr });

describe("share target (Android «Compartir» → Estampido)", () => {
  it("POST /compartir without the service worker just opens the app; sw.js is never cached", async () => {
    const app = createServerApp({ api: api(), webDist: dist, trustProxy: true });
    const fd = new FormData();
    fd.set("media", new File([new Uint8Array(10)], "v.mp4", { type: "video/mp4" }));
    const r = await app.request("/compartir", { method: "POST", body: fd });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/");
    const sw = await app.request("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers.get("cache-control")).toBe("no-cache");
  });

  it("the manifest declares the share target for videos, images and audio", async () => {
    const { readFile } = await import("node:fs/promises");
    const m = JSON.parse(await readFile(new URL("../../web/public/manifest.webmanifest", import.meta.url), "utf8"));
    expect(m.share_target).toMatchObject({ action: "/compartir", method: "POST", enctype: "multipart/form-data" });
    const files = m.share_target.params.files[0];
    expect(files.name).toBe("media");
    for (const t of ["video/*", "image/*", "audio/*", ".opus"]) expect(files.accept).toContain(t);
  });
});

describe("hardening", () => {
  it("big JSON bodies are refused before any route reads them (uploads keep their own cap)", async () => {
    const app = createServerApp({ api: api(), trustProxy: true });
    const big = JSON.stringify({ x: "a".repeat(300 * 1024) });
    const r = await app.request("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(big.length), ...ip("7.7.7.7") },
      body: big,
    });
    expect(r.status).toBe(413);
  });

  it("asking for places in line has its own per-IP limit", async () => {
    const app = createServerApp({ api: api(), trustProxy: true, limits: { slot: { max: 2, windowMs: 60_000 } } });
    const ask = () => app.request("/api/convert/slot", { method: "POST", headers: ip("8.8.4.4") });
    expect((await ask()).status).not.toBe(429);
    expect((await ask()).status).not.toBe(429);
    expect((await ask()).status).toBe(429);
  });
});

describe("production server", () => {
  it("SEO: per-route head with absolute URLs from the proxy host; robots.txt + sitemap.xml", async () => {
    const app = createServerApp({ api: api(), webDist: dist, trustProxy: true, googleVerification: "abcDEF123_-xyz" });
    const h = { "x-forwarded-proto": "https", "x-forwarded-host": "estampido.example" };
    const home = await (await app.request("/", { headers: h })).text();
    expect(home).toContain("<title>Estampido · Stickers de WhatsApp con sonido</title>");
    expect(home).not.toContain("<title>dev</title>");
    expect(home).toContain('<link rel="canonical" href="https://estampido.example/" />');
    expect(home).toContain('<meta property="og:image" content="https://estampido.example/og-image.png" />');
    expect(home).toContain('<meta name="google-site-verification" content="abcDEF123_-xyz" />');
    expect(home).toContain('"@type":"WebApplication"');
    const community = await (await app.request("/comunidad", { headers: h })).text();
    expect(community).toContain("<title>Comunidad · Sonidos y stickers con sonido · Estampido</title>");
    expect(community).toContain('href="https://estampido.example/comunidad"');
    const missing = await (await app.request("/no/existe", { headers: h })).text();
    expect(missing).toContain('<meta name="robots" content="noindex" />');
    expect(missing).not.toContain('rel="canonical"');

    const robots = await app.request("/robots.txt", { headers: h });
    expect(robots.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await robots.text()).toBe(
      "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: https://estampido.example/sitemap.xml\n",
    );
    const sitemap = await app.request("/sitemap.xml", { headers: h });
    expect(sitemap.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await sitemap.text();
    for (const loc of [
      "https://estampido.example/",
      "https://estampido.example/comunidad",
      "https://estampido.example/privacidad",
    ]) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect(xml).not.toContain("/admin");
  });

  it("SEO: SVA_PUBLIC_URL wins; forged Host headers can't inject markup", async () => {
    const pinned = createServerApp({ api: api(), webDist: dist, trustProxy: true, publicUrl: "https://estampido.mx/" });
    const html = await (await pinned.request("/", { headers: { "x-forwarded-host": "evil.example" } })).text();
    expect(html).toContain('href="https://estampido.mx/"');
    expect(html).not.toContain("evil.example");

    const open = createServerApp({ api: api(), webDist: dist, trustProxy: true });
    const forged = await (await open.request("/", { headers: { "x-forwarded-host": '"><script>x</script>' } })).text();
    expect(forged).not.toContain("<script>x</script>");
    // Untrusted proxy: X-Forwarded-* ignored entirely.
    const direct = createServerApp({ api: api(), webDist: dist, trustProxy: false });
    expect(
      await (await direct.request("/robots.txt", { headers: { "x-forwarded-host": "evil.example" } })).text(),
    ).not.toContain("evil.example");
  });

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

/** A stable browser id (UUID shape) per name. */
const uuidFor = (name: string) => {
  const hex = Buffer.from(name.padEnd(16, "_")).toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

describe("creating stickers: limits per person, not per neighbourhood", () => {
  const as = (addr: string, browser?: string) => ({
    ...ip(addr),
    ...(browser ? { "x-estampido-client": uuidFor(browser) } : {}),
  });
  const convert = (app: ReturnType<typeof createServerApp>, addr: string, browser?: string) =>
    app.request("/api/convert", { method: "POST", headers: as(addr, browser) });

  it("people sharing one IP (mobile data) each get their own quota", async () => {
    const app = createServerApp({
      api: api(),
      trustProxy: true,
      limits: { convertBrowser: { max: 2, windowMs: 60_000 }, convert: { max: 100, windowMs: 60_000 } },
    });
    for (const who of ["ana", "beto", "caro"]) {
      expect((await convert(app, "5.5.5.5", who)).status).not.toBe(429);
      expect((await convert(app, "5.5.5.5", who)).status).not.toBe(429);
    }
    const r = await convert(app, "5.5.5.5", "ana");
    expect(r.status).toBe(429);
    const body = (await r.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toMatch(/^Creaste muchos stickers seguidos\. Puedes crear otro en \d+ (s|min)\.$/);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await convert(app, "5.5.5.5", "dani")).status).not.toBe(429); // a new person on the same IP: fine
  });

  it("rotating browser ids doesn't escape the per-IP backstop; a refused request doesn't spend the IP's quota", async () => {
    const app = createServerApp({
      api: api(),
      trustProxy: true,
      limits: { convertBrowser: { max: 1, windowMs: 60_000 }, convert: { max: 3, windowMs: 60_000 } },
    });
    expect((await convert(app, "6.6.6.6", "a")).status).not.toBe(429);
    for (let i = 0; i < 5; i++) expect((await convert(app, "6.6.6.6", "a")).status).toBe(429); // own quota: IP untouched
    expect((await convert(app, "6.6.6.6", "b")).status).not.toBe(429);
    expect((await convert(app, "6.6.6.6", "c")).status).not.toBe(429);
    const r = await convert(app, "6.6.6.6", "d");
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/Mucha gente en tu red/);
    expect((await convert(app, "7.7.7.7", "d")).status).not.toBe(429);
  });

  it("hitting the create limit never jails the IP (it's normal use, not an attack)", async () => {
    const shield = new Shield({ ...DEFAULT_SHIELD, jailAfter: 2 });
    const app = createServerApp({
      api: api(),
      trustProxy: true,
      shield,
      limits: { convertBrowser: { max: 1, windowMs: 60_000 } },
    });
    for (let i = 0; i < 6; i++) await convert(app, "8.8.8.8", "a");
    for (let i = 0; i < 6; i++) await app.request("/api/convert/slot", { method: "POST", headers: as("8.8.8.8", "a") });
    expect(shield.jailedIps()).toEqual([]);
    expect((await app.request("/api/queue", { headers: as("8.8.8.8", "b") })).status).not.toBe(403);
  });

  it("defaults are roomy: 40 per person and 200 per IP every 10 min", async () => {
    const app = createServerApp({ api: api(), trustProxy: true });
    for (let i = 0; i < 40; i++) expect((await convert(app, "9.9.9.1", "solo")).status).not.toBe(429);
    expect((await convert(app, "9.9.9.1", "solo")).status).toBe(429);
    expect(waitText(1)).toBe("1 s");
    expect(waitText(59_000)).toBe("59 s");
    expect(waitText(61_000)).toBe("2 min");
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
