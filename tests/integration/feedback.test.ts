import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AdminFeedback, FEEDBACK_LIMITS } from "../../src/adapters/http/contract.js";
import { type Browser, type Harness, makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

/** Feedback box: anyone can write; anti-spam; the admin reads, marks and deletes. */
let dir: string;
let h: Harness;
beforeEach(async () => {
  dir = await makeTempDir();
  h = await makeHarness(dir);
});
afterEach(async () => {
  h.close();
  await rm(dir, { recursive: true, force: true });
});

const send = (b: Browser, body: unknown) => h.req(b, "/api/feedback", { method: "POST", body: JSON.stringify(body) });
const inbox = (q = "") => h.json<AdminFeedback>(h.admin(`/api/admin/feedback${q}`));

describe("sending feedback", () => {
  it("validates kind, length and fields; needs a browser id", async () => {
    for (const bad of [
      {},
      { kind: "queja", message: "Hola que tal" },
      { kind: "idea", message: "hey" },
      { kind: "idea", message: "   \u0000\u0007   " },
      { kind: "idea", message: "x".repeat(FEEDBACK_LIMITS.maxMessage + 1) },
      { kind: "idea", message: "Una idea genial", contact: "x".repeat(121) },
      { kind: "idea", message: "Una idea genial", admin: true },
      "nope",
    ]) {
      expect((await send("anon", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(
      (await h.anonymous("/api/feedback", { method: "POST", body: '{"kind":"idea","message":"hola hola"}' })).status,
    ).toBe(400);
  });

  it("stores it cleaned: path without query, control chars out, newlines kept; signed-in author attached", async () => {
    await h.signIn("ana", "ana");
    expect(
      (
        await send("ana", {
          kind: "problema",
          message: "No suena\n\n\n\nen iPhone\u0007",
          page: "/comunidad?q=secreto#x",
          app: "v0.1.0 · Safari iOS",
        })
      ).status,
    ).toBe(201);
    h.clock.now += 1000;
    expect(
      (await send("anon", { kind: "idea", message: "Modo oscuro más oscuro", contact: "yo@correo.mx" })).status,
    ).toBe(201);
    const { items, unread } = await inbox();
    expect(unread).toBe(2);
    expect(items[1]).toMatchObject({
      kind: "problema",
      message: "No suena\n\nen iPhone",
      page: "/comunidad",
      app: "v0.1.0 · Safari iOS",
      author: { handle: "ana" },
      status: "nuevo",
    });
    expect(items[0]).toMatchObject({ contact: "yo@correo.mx", author: null });
  });

  it("a filled honeypot looks accepted but stores nothing", async () => {
    expect((await send("anon", { kind: "idea", message: "compra seguidores", website: "http://spam" })).status).toBe(
      201,
    );
    expect((await inbox()).items).toEqual([]);
  });

  it(`at most ${FEEDBACK_LIMITS.perHour} per person per hour`, async () => {
    for (let i = 0; i < FEEDBACK_LIMITS.perHour; i++) {
      expect((await send("anon", { kind: "otro", message: `Mensaje número ${i}` })).status).toBe(201);
    }
    const r = await send("anon", { kind: "otro", message: "Uno más por favor" });
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: { code: "too_many" } });
    expect((await send("beto", { kind: "otro", message: "Otra persona sí puede" })).status).toBe(201);
    h.clock.now += 3_600_001;
    expect((await send("anon", { kind: "otro", message: "Una hora después" })).status).toBe(201);
  });
});

describe("admin inbox", () => {
  it("needs the admin password", async () => {
    expect((await h.anonymous("/api/admin/feedback")).status).toBe(401);
    expect((await h.anonymous("/api/admin/feedback/x", { method: "PATCH", body: "{}" })).status).toBe(401);
    expect((await h.anonymous("/api/admin/feedback/x", { method: "DELETE" })).status).toBe(401);
  });

  it("marks read/done, filters by status, deletes", async () => {
    await send("anon", { kind: "idea", message: "Primera idea" });
    h.clock.now += 1000;
    await send("beto", { kind: "problema", message: "Segundo problema" });
    const [newest, oldest] = (await inbox()).items;
    expect(
      (await h.admin(`/api/admin/feedback/${newest?.id}`, { method: "PATCH", body: '{"status":"hecho"}' })).status,
    ).toBe(200);
    expect(
      (await h.admin(`/api/admin/feedback/${newest?.id}`, { method: "PATCH", body: '{"status":"raro"}' })).status,
    ).toBe(400);
    const pending = await inbox("?status=nuevo");
    expect(pending.items.map((i) => i.id)).toEqual([oldest?.id]);
    expect(pending.unread).toBe(1);
    expect((await h.admin(`/api/admin/feedback/${oldest?.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await h.admin(`/api/admin/feedback/${oldest?.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await inbox()).items.map((i) => i.status)).toEqual(["hecho"]);
  });

  it("deleting an account keeps its feedback, without the author", async () => {
    await h.signIn("ana", "ana");
    await send("ana", { kind: "idea", message: "Me encanta la app" });
    await h.req("ana", "/api/me", { method: "DELETE", body: JSON.stringify({ confirm: "BORRAR MI CUENTA" }) });
    expect((await inbox()).items[0]).toMatchObject({ message: "Me encanta la app", author: null });
  });
});
