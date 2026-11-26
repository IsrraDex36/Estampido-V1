import { BlockList, isIPv4, isIPv6 } from "node:net";
import type { MiddlewareHandler } from "hono";
import { RateLimiter } from "../../utils/rateLimit.js";

/**
 * First line of defense against floods (one person trying to take the site
 * down). Runs before anything else and rejects cheaply, without parsing
 * bodies or touching the database:
 * - global cap on requests in flight (overload → instant 503, the server
 *   keeps answering instead of drowning);
 * - per-IP cap on requests in flight (one client can't hog the server);
 * - per-IP request rate over EVERYTHING (pages, assets, API);
 * - jail: an IP that keeps going after being limited is blocked for a while.
 * Network floods (SYN/UDP) can't be stopped here: that's Cloudflare and the
 * host firewall (see docs/SEGURIDAD.md).
 */
export interface ShieldOptions {
  /** Requests in flight for the whole server. */
  maxInflight: number;
  /** Requests in flight per IP. */
  maxInflightPerIp: number;
  /** Requests per IP per window (all paths). */
  perIp: { max: number; windowMs: number };
  /** Limited this many times within `jailWindowMs` → jailed. */
  jailAfter: number;
  jailWindowMs: number;
  jailMs: number;
  now?: () => number;
}

export const DEFAULT_SHIELD: ShieldOptions = {
  maxInflight: 400,
  maxInflightPerIp: 24,
  perIp: { max: 1500, windowMs: 5 * 60_000 }, // a page load is ~30 requests: room for real use
  jailAfter: 40,
  jailWindowMs: 60_000,
  jailMs: 15 * 60_000,
};

/** Paths never shielded: the container health check (localhost). */
const EXEMPT = new Set(["/api/health"]);

export class Shield {
  private inflight = 0;
  private readonly perIpInflight = new Map<string, number>();
  private readonly rate: RateLimiter;
  private readonly strikes: RateLimiter;
  private readonly jailed = new Map<string, number>();
  private readonly now: () => number;
  /** Counters for /admin. */
  readonly stats = { rejectedBusy: 0, rejectedIp: 0, jailedTotal: 0 };

  constructor(private readonly o: ShieldOptions = DEFAULT_SHIELD) {
    this.now = o.now ?? Date.now;
    this.rate = new RateLimiter(o.perIp.max, o.perIp.windowMs);
    this.strikes = new RateLimiter(o.jailAfter, o.jailWindowMs);
  }

  /** IPs currently blocked (for /admin). */
  jailedIps(): { ip: string; untilMs: number }[] {
    const t = this.now();
    return [...this.jailed].filter(([, until]) => until > t).map(([ip, untilMs]) => ({ ip, untilMs }));
  }

  /** Called by the API rate limits too: being limited counts as a strike. */
  strike(ip: string): void {
    const t = this.now();
    this.strikes.take(ip, t);
    // The jailAfter-th strike inside the window jails (peek > 0 = window full).
    if (this.strikes.peek(ip, t) > 0) {
      if (!this.jailed.has(ip)) this.stats.jailedTotal++;
      this.jailed.set(ip, this.now() + this.o.jailMs);
      if (this.jailed.size > 50_000) this.sweep();
    }
  }

  private sweep(): void {
    const t = this.now();
    for (const [ip, until] of this.jailed) if (until <= t) this.jailed.delete(ip);
  }

  isJailed(ip: string): number {
    const until = this.jailed.get(ip);
    if (!until) return 0;
    const left = until - this.now();
    if (left <= 0) {
      this.jailed.delete(ip);
      return 0;
    }
    return left;
  }

  middleware(ipOf: (c: Parameters<MiddlewareHandler>[0]) => string): MiddlewareHandler {
    return async (c, next) => {
      if (EXEMPT.has(c.req.path)) return next();
      const ip = ipOf(c);
      const jailed = this.isJailed(ip);
      if (jailed > 0) {
        this.stats.rejectedIp++;
        return c.text("Demasiadas solicitudes.", 429, { "Retry-After": String(Math.ceil(jailed / 1000)) });
      }
      if (this.inflight >= this.o.maxInflight) {
        this.stats.rejectedBusy++;
        return c.text("El servidor está ocupado. Intenta en unos segundos.", 503, { "Retry-After": "10" });
      }
      const mine = this.perIpInflight.get(ip) ?? 0;
      const overRate = this.rate.take(ip, this.now()) > 0;
      if (mine >= this.o.maxInflightPerIp || overRate) {
        this.stats.rejectedIp++;
        this.strike(ip);
        return c.text("Demasiadas solicitudes.", 429, { "Retry-After": "30" });
      }
      this.inflight++;
      this.perIpInflight.set(ip, mine + 1);
      try {
        await next();
      } finally {
        this.inflight--;
        const left = (this.perIpInflight.get(ip) ?? 1) - 1;
        if (left <= 0) this.perIpInflight.delete(ip);
        else this.perIpInflight.set(ip, left);
      }
    };
  }

  get inFlight(): number {
    return this.inflight;
  }
}

// ── trusting the client IP ──────────────────────────────────────────────────

/** Official Cloudflare ranges (https://www.cloudflare.com/ips/), checked 2026-11. */
export const CLOUDFLARE_RANGES = {
  v4: [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ],
  v6: [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ],
};

const cloudflare = new BlockList();
for (const r of CLOUDFLARE_RANGES.v4) {
  const [net, bits] = r.split("/") as [string, string];
  cloudflare.addSubnet(net, Number(bits), "ipv4");
}
for (const r of CLOUDFLARE_RANGES.v6) {
  const [net, bits] = r.split("/") as [string, string];
  cloudflare.addSubnet(net, Number(bits), "ipv6");
}

/** Is this address one of Cloudflare's edge servers? Pure. */
export function isCloudflareIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "");
  if (isIPv4(clean)) return cloudflare.check(clean, "ipv4");
  if (isIPv6(clean)) return cloudflare.check(clean, "ipv6");
  return false;
}
