// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartialSendError, SEND_BATCH, sendToSelf } from "../../web/src/features/self/endpoints.js";
import { useSelfStore } from "../../web/src/features/self/selfStore.js";
import { sendMessage, useSelfSend } from "../../web/src/features/self/useSelfSend.js";

type Req = { session: string; results?: string[]; community?: string[]; pack?: string };
let reqs: Req[];
const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function bot(answer: (r: Req, n: number) => Response | Promise<Response>) {
  reqs = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const r = JSON.parse(String(init?.body)) as Req;
      reqs.push(r);
      return answer(r, reqs.length);
    }),
  );
}
/** A bot that sends everything and renews the session as «<old>+». */
const allGood = (r: Req) =>
  ok({
    sent: (r.results?.length ?? 0) + (r.community?.length ?? 0),
    failed: 0,
    pending: 0,
    skipped: 0,
    session: `${r.session}+`,
  });
const ids = (n: number, p = "r") => Array.from({ length: n }, (_, i) => `${p}${i}`);

beforeEach(() => {
  localStorage.clear();
  useSelfStore.setState({ session: "s2.0", linkedAt: 1, dialog: { open: false } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sending many stickers", () => {
  it("25 stickers → batches of 10/10/5, each from the session the previous one renewed, with progress", async () => {
    bot(allGood);
    const progress: [number, number][] = [];
    const sum = await sendToSelf({ results: ids(15), community: ids(10, "c"), pack: "P1" }, (d, n) =>
      progress.push([d, n]),
    );
    expect(SEND_BATCH).toBe(10);
    expect(reqs.map((r) => (r.results?.length ?? 0) + (r.community?.length ?? 0))).toEqual([10, 10, 5]);
    expect(reqs.map((r) => r.session)).toEqual(["s2.0", "s2.0+", "s2.0++"]); // never the same session twice
    expect(reqs.every((r) => r.pack === "P1")).toBe(true);
    expect(progress).toEqual([
      [10, 25],
      [20, 25],
      [25, 25],
    ]);
    expect(sum).toEqual({ requested: 25, sent: 25, failed: 0, pending: 0, skipped: 0 });
    expect(useSelfStore.getState().session).toBe("s2.0+++");
  });

  it("duplicates are dropped before sending", async () => {
    bot(allGood);
    const sum = await sendToSelf({ results: ["a", "a", "b"], community: ["c", "c"] });
    expect(sum.requested).toBe(3);
  });

  it("double tap / two buttons at once: one after the other, the second starts from the FIRST one's renewed session", async () => {
    bot(async (r) => {
      await new Promise((x) => setTimeout(x, 10));
      return allGood(r);
    });
    await Promise.all([sendToSelf({ results: ["a"] }), sendToSelf({ community: ["b"] })]);
    expect(reqs.map((r) => r.session)).toEqual(["s2.0", "s2.0+"]);
    expect(useSelfStore.getState().session).toBe("s2.0++");
  });

  it("the server ran out of time → stops; what's left is reported pending (no extra batches)", async () => {
    bot((r) => ok({ sent: 7, failed: 0, pending: 3, skipped: 0, session: `${r.session}+` }));
    const sum = await sendToSelf({ results: ids(25) });
    expect(reqs).toHaveLength(1);
    expect(sum).toEqual({ requested: 25, sent: 7, failed: 0, pending: 18, skipped: 0 });
    expect(useSelfStore.getState().session).toBe("s2.0+"); // renewed even so
  });

  it("an error in batch 2 keeps batch 1's progress and says exactly what's left", async () => {
    bot((r, n) => (n === 2 ? ok({ error: { code: "logged_out", message: "x" } }, 410) : allGood(r)));
    const err = await sendToSelf({ results: ids(15), pack: "P" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialSendError);
    const p = err as PartialSendError;
    expect(p.summary).toMatchObject({ requested: 15, sent: 10, pending: 5 });
    expect(p.remaining.results).toEqual(ids(15).slice(10));
    expect(p.remaining.pack).toBe("P");
  });
});

describe("what the person is told", () => {
  it.each([
    [{ requested: 1, sent: 1, failed: 0, pending: 0, skipped: 0 }, "success", "Tu sticker llegó a tu chat «Tú»"],
    [{ requested: 30, sent: 30, failed: 0, pending: 0, skipped: 0 }, "success", "30 stickers en tu chat «Tú»"],
    [{ requested: 30, sent: 27, failed: 1, pending: 0, skipped: 2 }, "warning", "Llegaron 27 de 30 a tu chat «Tú»"],
    [{ requested: 25, sent: 7, failed: 0, pending: 18, skipped: 0 }, "warning", "Llegaron 7 de 25 a tu chat «Tú»"],
    [{ requested: 2, sent: 0, failed: 0, pending: 0, skipped: 2 }, "error", "Esos stickers ya no existen."],
    [{ requested: 2, sent: 0, failed: 2, pending: 0, skipped: 0 }, "error", "No se pudo enviar a tu chat."],
  ] as const)("%o → %s", (sum, kind, text) => {
    const m = sendMessage(sum, "Tu sticker");
    expect(m.kind).toBe(kind);
    expect(m.text).toBe(text);
  });

  it("the detail names every reason", () => {
    const m = sendMessage({ requested: 30, sent: 25, failed: 1, pending: 2, skipped: 2 }, "x");
    expect(m.detail).toContain("2 ya no existen");
    expect(m.detail).toContain("1 no se pudo enviar");
    expect(m.detail).toContain("2 quedaron pendientes");
  });
});

describe("not linked / device removed mid-way", () => {
  it("not linked → the link dialog opens; after linking, the send runs", async () => {
    useSelfStore.setState({ session: null });
    bot(allGood);
    const { result } = renderHook(() => useSelfSend());
    act(() => result.current.send({ results: ["a"] }));
    expect(useSelfStore.getState().dialog.open).toBe(true);
    expect(reqs).toHaveLength(0);
    useSelfStore.getState().setSession("s2.new");
    await act(async () => {
      useSelfStore.getState().dialog.after?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.session).toBe("s2.new");
  });

  it("device removed in batch 2 → link again, then ONLY the stickers that hadn't arrived are sent", async () => {
    bot((r, n) => (n === 2 ? ok({ error: { code: "logged_out", message: "x" } }, 410) : allGood(r)));
    const { result } = renderHook(() => useSelfSend());
    await act(async () => {
      result.current.send({ results: ids(15) });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(useSelfStore.getState().session).toBeNull();
    expect(useSelfStore.getState().dialog.open).toBe(true);
    bot(allGood);
    useSelfStore.getState().setSession("s2.relinked");
    await act(async () => {
      useSelfStore.getState().dialog.after?.();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.results).toEqual(ids(15).slice(10)); // not the 10 already delivered
  });

  it("server busy → the session is kept (no relink), the error is shown", async () => {
    bot(() => ok({ error: { code: "busy", message: "Mucha gente" } }, 503));
    const { result } = renderHook(() => useSelfSend());
    await act(async () => {
      result.current.send({ results: ["a"] });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(useSelfStore.getState().session).toBe("s2.0");
    expect(useSelfStore.getState().dialog.open).toBe(false);
  });
});
