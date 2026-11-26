import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AccountRepo, User } from "./repo.js";
import { SESSION_TTL_MS } from "./repo.js";

/** Hono env: every API request knows its signed-in user (or null). */
export interface AppEnv {
  Variables: { user: User | null };
}

/**
 * Session cookie. In production `__Host-` forces Secure + Path=/ + no Domain
 * (can't be set or shadowed by a subdomain). HttpOnly: scripts can't read it.
 * SameSite=Lax: never sent on cross-site POST/PUT/DELETE.
 */
export function sessionCookie(secure: boolean) {
  const name = secure ? "__Host-estampido" : "estampido_session";
  const base = { path: "/", httpOnly: true, secure, sameSite: "Lax" as const };
  return {
    name,
    read: (c: Context) => getCookie(c, name) ?? null,
    write: (c: Context, token: string) =>
      setCookie(c, name, token, { ...base, maxAge: Math.floor(SESSION_TTL_MS / 1000) }),
    clear: (c: Context) => deleteCookie(c, name, base),
  };
}
export type SessionCookie = ReturnType<typeof sessionCookie>;

/** Resolve the session cookie into `c.var.user` (one indexed lookup). */
export function sessionMiddleware(accounts: AccountRepo, cookie: SessionCookie): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = cookie.read(c);
    const user = token ? await accounts.sessionUser(token).catch(() => null) : null;
    if (token && !user) cookie.clear(c); // stale cookie: drop it
    c.set("user", user);
    await next();
  };
}

/**
 * Defense in depth against CSRF on cookie-authenticated writes: a write that
 * carries the session cookie and says where it comes from (Origin) must come
 * from this same host. Without the cookie there is nothing to forge. Local
 * development (Vite proxy rewrites Host) may also come from localhost.
 */
export function sameOrigin(cookie: SessionCookie, { allowLocalhost = false } = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    const origin = c.req.header("origin");
    if (origin && cookie.read(c)) {
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      let from: URL | null = null;
      try {
        from = new URL(origin);
      } catch {
        // malformed ("null", garbage) → rejected below
      }
      const local = allowLocalhost && from !== null && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(from.hostname);
      if (!from || (!local && from.host !== host)) {
        return c.json({ error: { code: "bad_origin", message: "Origen no permitido." } }, 403);
      }
    }
    await next();
  };
}
