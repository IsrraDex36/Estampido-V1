// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeFailure } from "../../web/src/features/converter/model/failure.js";
import { ApiError, convertVideo, proxyFailure, readJson, UNAVAILABLE_MESSAGE } from "../../web/src/lib/api.js";

const html = (status: number, headers: Record<string, string> = {}) =>
  new Response("<html><body>Bad Gateway</body></html>", {
    status,
    headers: { "content-type": "text/html", ...headers },
  });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("server restarting (deploy) is not «algo falló de nuestro lado»", () => {
  it("proxy 502/503/504 without JSON → «unavailable» with a retry delay; other statuses stay «http»", () => {
    for (const s of [502, 503, 504])
      expect(proxyFailure(s)).toMatchObject({
        code: "unavailable",
        status: s,
        retryAfterSec: 8,
        message: UNAVAILABLE_MESSAGE,
      });
    expect(proxyFailure(503, 20).retryAfterSec).toBe(20);
    expect(proxyFailure(500)).toMatchObject({ code: "http", status: 500 });
  });

  it("readJson: an HTML 502 page → unavailable; the app's own JSON errors keep their code", async () => {
    await expect(readJson(html(502))).rejects.toMatchObject({ code: "unavailable" });
    await expect(readJson(html(503, { "Retry-After": "15" }))).rejects.toMatchObject({
      code: "unavailable",
      retryAfterSec: 15,
    });
    // The app's «busy» (503 + JSON) is NOT a restart.
    await expect(readJson(json({ error: { code: "busy", message: "fila llena" } }, 503))).rejects.toMatchObject({
      code: "busy",
    });
    await expect(readJson(json({ ok: 1 }))).resolves.toEqual({ ok: 1 });
  });

  it("the card says it plainly and retries by itself (5–30 s)", () => {
    const v = describeFailure({ code: "unavailable", status: 502, message: UNAVAILABLE_MESSAGE, retryAfterSec: 8 });
    expect(v.title).toBe("Estampido se está actualizando");
    expect(v.body).toContain("No es tu archivo");
    expect(v.tone).toBe("connection");
    expect(v.autoRetrySec).toBe(8);
    expect(v.actions).toContain("retry");
    expect(describeFailure({ code: "unavailable", status: 503, message: "", retryAfterSec: 999 }).autoRetrySec).toBe(
      30,
    );
  });
});

describe("following a job through a restart", () => {
  let uploadStatus = 202;
  let uploadBody: unknown = { jobId: "j1", position: 0, etaSec: 0 };
  class FakeXhr {
    status = 0;
    response: unknown = null;
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    responseType = "";
    open() {}
    setRequestHeader() {}
    getResponseHeader() {
      return null;
    }
    abort() {}
    send() {
      this.status = uploadStatus;
      this.response = uploadBody;
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    uploadStatus = 202;
    uploadBody = { jobId: "j1", position: 0, etaSec: 0 };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
  const run = () => convertVideo({ media: file }, {} as never);

  it("a few 502s while polling are waited out; the job then finishes", async () => {
    const polls = [html(502), html(502), html(504), json({ state: "done", result: { id: "r1" } })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/slot") ? json({ slot: "s", etaSec: 0, expiresInSec: 300 }) : (polls.shift() as Response),
      ),
    );
    const p = run();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(p).resolves.toEqual({ id: "r1" });
  });

  it("down for too long → «unavailable» (the card retries by itself), not a generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/slot") ? json({ slot: "s", etaSec: 0, expiresInSec: 300 }) : html(502),
      ),
    );
    const p = run().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await p).toMatchObject({ code: "unavailable" });
  });

  it("back up but the job died with the old process → «expired» (offers to create it again)", async () => {
    const polls = [html(502), json({ error: { code: "expired", message: "ya no existe" } }, 404)];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/slot") ? json({ slot: "s", etaSec: 0, expiresInSec: 300 }) : (polls.shift() as Response),
      ),
    );
    const p = run().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toMatchObject({ code: "expired", status: 404 });
  });

  it("restart hits the slot or the upload: also «unavailable»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => html(503)),
    );
    await expect(run()).rejects.toMatchObject({ code: "unavailable" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ slot: "s", etaSec: 0, expiresInSec: 300 })),
    );
    uploadStatus = 502;
    uploadBody = null;
    await expect(run()).rejects.toBeInstanceOf(ApiError);
    await expect(run()).rejects.toMatchObject({ code: "unavailable" });
  });
});
