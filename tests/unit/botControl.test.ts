import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertResultFile, createControlApp } from "../../src/adapters/bot/control.js";

let base: string;
let results: string;
let outside: string;
const TOKEN = "t".repeat(64);
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "sva-ctl-"));
  results = join(base, "results");
  outside = join(base, "secret.txt");
  await mkdir(join(results, "job"), { recursive: true });
  await writeFile(join(results, "job", "sticker.webp"), "RIFF");
  await writeFile(outside, "private");
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function fakeSock() {
  const sent: { jid: string; content: unknown }[] = [];
  const sock = {
    user: { id: "525500000001:8@s.whatsapp.net" },
    sendMessage: vi.fn(async (jid: string, content: unknown) => {
      sent.push({ jid, content });
      return undefined;
    }),
  } as unknown as WASocket;
  return { sock, sent };
}

describe("assertResultFile", () => {
  it("accepts files under the results root, rejects outside / traversal / symlink escapes", async () => {
    await expect(assertResultFile(join(results, "job", "sticker.webp"), results)).resolves.toContain("sticker.webp");
    await expect(assertResultFile(outside, results)).rejects.toThrow();
    await expect(assertResultFile(join(results, "..", "secret.txt"), results)).rejects.toThrow();
    await symlink(outside, join(results, "job", "link.webp"));
    await expect(assertResultFile(join(results, "job", "link.webp"), results)).rejects.toThrow();
  });
});

describe("control app", () => {
  it("rejects missing/wrong token", async () => {
    const app = createControlApp({ current: () => null }, TOKEN, results);
    expect((await app.request("/status")).status).toBe(401);
    expect((await app.request("/status", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("status reflects the socket", async () => {
    const { sock } = fakeSock();
    expect(
      await (
        await createControlApp({ current: () => null }, TOKEN, results).request("/status", { headers: auth })
      ).json(),
    ).toEqual({ connected: false });
    expect(
      await (
        await createControlApp({ current: () => sock }, TOKEN, results).request("/status", { headers: auth })
      ).json(),
    ).toEqual({ connected: true });
  });

  it("sends a sticker ONLY to the owner's own chat", async () => {
    const { sock, sent } = fakeSock();
    const app = createControlApp({ current: () => sock }, TOKEN, results);
    const res = await app.request("/send-self", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        webpPath: join(results, "job", "sticker.webp"),
        animated: true,
        to: "1234@s.whatsapp.net",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivered: "sticker" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.jid).toBe("525500000001@s.whatsapp.net"); // normalized self, `to` ignored
  });

  it("accepts long sounds up to the pipeline limit (e.g. 180.0065 s), rejects beyond", async () => {
    const { sock } = fakeSock();
    const app = createControlApp({ current: () => sock }, TOKEN, results);
    await writeFile(join(results, "job", "sticker.ogg"), "OggS");
    const body = (sec: number) =>
      JSON.stringify({
        webpPath: join(results, "job", "sticker.webp"),
        audioPath: join(results, "job", "sticker.ogg"),
        audioDurationSec: sec,
        animated: true,
      });
    // Passes validation (then fails later at upload on the fake socket → 502, not 400).
    expect((await app.request("/send-self", { method: "POST", headers: auth, body: body(180.0065) })).status).not.toBe(
      400,
    );
    const tooLong = await app.request("/send-self", { method: "POST", headers: auth, body: body(500) });
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(await tooLong.json())).toMatch(/audioDurationSec/);
  });

  it("403 for files outside results; 503 when disconnected; 400 bad body", async () => {
    const { sock } = fakeSock();
    const app = createControlApp({ current: () => sock }, TOKEN, results);
    const bad = await app.request("/send-self", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ webpPath: outside, animated: false }),
    });
    expect(bad.status).toBe(403);
    expect((await app.request("/send-self", { method: "POST", headers: auth, body: "{" })).status).toBe(400);
    const off = createControlApp({ current: () => null }, TOKEN, results);
    expect((await off.request("/send-self", { method: "POST", headers: auth, body: "{}" })).status).toBe(503);
  });
});
