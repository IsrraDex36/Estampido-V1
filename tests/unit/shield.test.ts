import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientIp } from "../../src/adapters/http/server.js";
import { isCloudflareIp, Shield, type ShieldOptions } from "../../src/adapters/http/shield.js";

function setup(over: Partial<ShieldOptions> = {}) {
  let now = 0;
  const shield = new Shield({
    maxInflight: 3,
    maxInflightPerIp: 2,
    perIp: { max: 10, windowMs: 60_000 },
    jailAfter: 3,
    jailWindowMs: 60_000,
    jailMs: 15 * 60_000,
    now: () => now,
    ...over,
  });
  const gates: (() => void)[] = [];
  const app = new Hono();
  app.use(
    "*",
    shield.middleware((c) => c.req.header("x-ip") ?? "?"),
  );
  app.get("/slow", () => new Promise<Response>((r) => gates.push(() => r(new Response("ok")))));
  app.get("/fast", (c) => c.text("ok"));
  app.get("/api/health", (c) => c.text("ok"));
  const req = (path: string, ip: string) => app.request(path, { headers: { "x-ip": ip } });
  return {
    shield,
    req,
    gates,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe("flood shield", () => {
  it("global cap: extra requests get an instant 503 while the server keeps working", async () => {
    const t = setup({ maxInflightPerIp: 10 });
    const pending = [t.req("/slow", "a"), t.req("/slow", "b"), t.req("/slow", "c")];
    await new Promise((r) => setTimeout(r, 10));
    expect((await t.req("/fast", "d")).status).toBe(503);
    for (const g of t.gates) g();
    await Promise.all(pending);
    expect((await t.req("/fast", "d")).status).toBe(200);
  });

  it("one IP can't hog the server (per-IP in-flight cap)", async () => {
    const t = setup();
    const pending = [t.req("/slow", "a"), t.req("/slow", "a")];
    await new Promise((r) => setTimeout(r, 10));
    expect((await t.req("/fast", "a")).status).toBe(429);
    expect((await t.req("/fast", "b")).status).toBe(200); // others unaffected
    for (const g of t.gates) g();
    await Promise.all(pending);
  });

  it("insisting after the limit → jailed for 15 min, then free again", async () => {
    const t = setup({ maxInflightPerIp: 100 });
    for (let i = 0; i < 10; i++) expect((await t.req("/fast", "x")).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await t.req("/fast", "x")).status).toBe(429);
    expect(t.shield.jailedIps().map((j) => j.ip)).toEqual(["x"]);
    t.tick(2 * 60_000); // the rate window passed, but the jail didn't
    expect((await t.req("/fast", "x")).status).toBe(429);
    t.tick(14 * 60_000);
    expect((await t.req("/fast", "x")).status).toBe(200);
    expect(t.shield.stats.jailedTotal).toBe(1);
  });

  it("the health check is never blocked", async () => {
    const t = setup({ maxInflightPerIp: 100, perIp: { max: 1, windowMs: 60_000 } });
    await t.req("/fast", "z");
    for (let i = 0; i < 5; i++) await t.req("/fast", "z");
    expect((await t.req("/api/health", "z")).status).toBe(200);
  });
});

describe("trusting the client IP", () => {
  const ipFor = (headers: Record<string, string>, behindCloudflare: boolean) => {
    const app = new Hono();
    app.get("/", (c) => c.text(clientIp(c, true, behindCloudflare)));
    return Promise.resolve(app.request("/", { headers })).then((r) => r.text());
  };

  it("a forged CF-Connecting-IP is ignored unless the request really came through Cloudflare", async () => {
    // Not behind Cloudflare: the header is attacker-controlled → use the proxy's hop.
    expect(await ipFor({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }, false)).toBe("9.9.9.9");
    // Behind Cloudflare but the hop isn't Cloudflare (direct hit on the origin) → ignored.
    expect(await ipFor({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }, true)).toBe("9.9.9.9");
    // Through a real Cloudflare edge → the visitor's IP.
    expect(await ipFor({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "104.16.1.1" }, true)).toBe("1.2.3.4");
    // Spoofed left-most X-Forwarded-For entries never win.
    expect(await ipFor({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }, false)).toBe("9.9.9.9");
  });

  it("Cloudflare ranges, v4 and v6", () => {
    expect(isCloudflareIp("104.16.1.1")).toBe(true);
    expect(isCloudflareIp("::ffff:172.64.0.5")).toBe(true);
    expect(isCloudflareIp("2606:4700::1111")).toBe(true);
    expect(isCloudflareIp("5.222.8.144")).toBe(false);
    expect(isCloudflareIp("nope")).toBe(false);
  });
});
