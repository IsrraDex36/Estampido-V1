import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { getConnInfo } from "@hono/node-server/conninfo";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { RateLimiter } from "../../utils/rateLimit.js";
import type { ApiErrorBody } from "./contract.js";

/**
 * Production server: one port for everything.
 *   security headers → per-IP rate limits → /api (createApp) → web (dist) with SPA fallback
 * Meant to sit behind a tunnel/reverse proxy on 127.0.0.1; with `trustProxy`
 * the client IP comes from CF-Connecting-IP / X-Forwarded-For (only safe
 * because nothing else can reach 127.0.0.1).
 */
export interface ServerOptions {
  api: Hono;
  /** Built web (web/dist). null → API only. */
  webDist?: string | null;
  trustProxy?: boolean;
  limits?: Partial<Record<LimitName, { max: number; windowMs: number }>>;
}

const MIN = 60_000;
export const DEFAULT_LIMITS = {
  convert: { max: 15, windowMs: 10 * MIN }, // CPU-heavy
  linkCode: { max: 10, windowMs: 10 * MIN },
  send: { max: 40, windowMs: 10 * MIN },
  publish: { max: 10, windowMs: 60 * MIN },
  soundUse: { max: 60, windowMs: 10 * MIN },
  api: { max: 600, windowMs: 10 * MIN }, // everything else under /api
} as const;
export type LimitName = keyof typeof DEFAULT_LIMITS;

const RULES: { name: Exclude<LimitName, "api">; method: string; path: RegExp }[] = [
  { name: "convert", method: "POST", path: /^\/api\/convert$/ },
  { name: "linkCode", method: "POST", path: /^\/api\/whatsapp\/link$/ },
  { name: "send", method: "POST", path: /^\/api\/results\/[^/]+\/whatsapp$/ },
  { name: "publish", method: "POST", path: /^\/api\/community\/stickers$/ },
  { name: "soundUse", method: "POST", path: /^\/api\/community\/sounds\/[^/]+\/use$/ },
];

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });

/**
 * Client IP: proxy headers only when trusted, else the socket's address.
 * Cloudflare sets CF-Connecting-IP. Generic proxies (Railway, Caddy) APPEND
 * to X-Forwarded-For, so the trustworthy entry is the rightmost one (anything
 * to its left was sent by the client and can be forged).
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = c.req.header("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = c.req
      .header("x-forwarded-for")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1);
    if (xff) return xff;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() in tests has no socket
  }
}

function rateLimits(opts: ServerOptions): MiddlewareHandler {
  const cfg = { ...DEFAULT_LIMITS, ...opts.limits };
  const limiters = Object.fromEntries(
    Object.entries(cfg).map(([k, v]) => [k, new RateLimiter(v.max, v.windowMs)]),
  ) as Record<LimitName, RateLimiter>;
  return async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/api/")) return next();
    const ip = clientIp(c, opts.trustProxy ?? false);
    const rule = RULES.find((r) => r.method === c.req.method && r.path.test(path));
    const name: LimitName = rule?.name ?? "api";
    const wait = limiters[name].take(ip);
    if (wait > 0) {
      c.header("Retry-After", String(Math.ceil(wait / 1000)));
      return c.json(
        fail("rate_limited", `Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(wait / 1000)} s.`),
        429,
      );
    }
    return next();
  };
}

/** CSP hashes for the inline scripts in index.html (the no-flash theme script). */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1] ?? "")
    .filter((body) => body.trim())
    .map((body) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`);
}

export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'", // motion/radix set inline styles
    "img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function securityHeaders(csp: string, trustProxy: boolean): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("X-Frame-Options", "DENY");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    // Microphone: «Grabar» voice notes on this origin only.
    h.set("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=(), usb=()");
    if ((h.get("content-type") ?? "").includes("text/html")) h.set("Content-Security-Policy", csp);
    if (trustProxy && c.req.header("x-forwarded-proto") === "https") {
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** Safe file under root, or null (no traversal, no dotfiles). */
export function resolveStatic(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").some((seg) => seg.startsWith("."))) return null;
  const full = normalize(join(root, decoded));
  return full === root || full.startsWith(root + sep) ? full : null;
}

async function sendFile(c: Context, path: string, cache: string): Promise<Response | null> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return null;
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": cache,
    },
  });
}

export function createServerApp(opts: ServerOptions): Hono {
  const root = opts.webDist ? resolve(opts.webDist) : null;
  const indexHtml = root ? join(root, "index.html") : null;
  const html = indexHtml ? readFileSync(indexHtml, "utf8") : "";
  const csp = contentSecurityPolicy(inlineScriptHashes(html));

  const app = new Hono();
  app.use("*", securityHeaders(csp, opts.trustProxy ?? false));
  app.use("*", rateLimits(opts));
  app.route("/", opts.api);

  if (root && indexHtml) {
    app.on(["GET", "HEAD"], "*", async (c) => {
      const path = c.req.path;
      if (path.startsWith("/api/")) return c.notFound();
      const file = path === "/" ? null : resolveStatic(root, path);
      if (file) {
        // Vite fingerprints /assets/* → cache forever; everything else revalidates.
        const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300";
        const res = await sendFile(c, file, cache);
        if (res) return res;
        if (extname(path)) return c.text("Not found", 404); // a missing asset is a real 404
      }
      // SPA fallback: every route (/, /comunidad, /privacidad, unknown → app's 404 page).
      return (await sendFile(c, indexHtml, "no-cache")) ?? c.text("Not found", 404);
    });
  }
  return app;
}
