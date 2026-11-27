// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelfLinkDialog } from "../../web/src/features/self/SelfLinkDialog.js";
import { useSelfStore } from "../../web/src/features/self/selfStore.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

beforeEach(() => {
  useSelfStore.setState({ session: null, linkedAt: null, dialog: { open: false } });
  localStorage.setItem("estampido-wa-country", "PE");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The bot answers the link status with this script, one entry per poll (last one repeats). */
function mount(script: unknown[]) {
  const posted: unknown[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
      if (url.endsWith("/api/self/link") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ id: "L1" });
      }
      if (url.includes("/api/self/link/L1")) {
        const next = script[Math.min(i++, script.length - 1)];
        return typeof next === "function" ? (next as () => Response)() : json(next);
      }
      return json({});
    }),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  render(createElement(QueryClientProvider, { client }, createElement(SelfLinkDialog)));
  return { posted, client };
}

describe("link dialog: from the number to «¡Listo!»", () => {
  it("Perú number → code → progress card (accepted, connecting, preparing) → ¡Listo! as @handle → closes and runs the pending send", async () => {
    const me = { id: "u1", handle: "ana_pe", displayName: "Ana" };
    const { posted, client } = mount([
      { state: "code", code: "ABCD-EFGH" },
      { state: "pairing", step: "connecting" },
      { state: "pairing", step: "preparing" },
      { state: "linked", session: "s2.sealed", me },
    ]);
    const after = vi.fn();
    act(() => useSelfStore.getState().openDialog(after));

    const input = await screen.findByLabelText("Número sin el +51");
    expect(screen.getByRole("button", { name: /Obtener código/ })).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "912 345" } });
    expect(screen.getByText("Faltan 3 dígitos (Perú: 9).")).toBeTruthy();
    fireEvent.change(input, { target: { value: "912 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: /Obtener código/ }));
    await waitFor(() => expect(posted).toEqual([{ phone: "51912345678" }]));

    expect(await screen.findByText("ABCD-EFGH", {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("Vinculando tu WhatsApp…", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("WhatsApp aceptó la vinculación")).toBeTruthy();
    expect(await screen.findByText("Preparando tu cuenta y tu chat «Tú»", {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("¡Listo, WhatsApp vinculado!", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("@ana_pe")).toBeTruthy();
    expect(useSelfStore.getState().session).toBe("s2.sealed");
    expect(client.getQueryData(queryKeys.account.me)).toEqual(me);
    expect(after).not.toHaveBeenCalled(); // the «¡Listo!» shows first…
    await waitFor(() => expect(after).toHaveBeenCalledTimes(1), { timeout: 3000 }); // …then the pending send runs
    expect(useSelfStore.getState().dialog.open).toBe(false);
  }, 15_000);

  it("a failure during linking shows its reason (no endless spinner)", async () => {
    mount([
      { state: "pairing", step: "connecting" },
      { state: "failed", reason: "El código venció antes de escribirlo en WhatsApp." },
    ]);
    act(() => useSelfStore.getState().openDialog());
    fireEvent.change(await screen.findByLabelText("Número sin el +51"), { target: { value: "912345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Obtener código/ }));
    expect(await screen.findByText("No se pudo vincular", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/venció antes de escribirlo/)).toBeTruthy();
    expect(useSelfStore.getState().session).toBeNull();
  }, 15_000);
});

describe("link dialog: the phone goes to WhatsApp and comes back (never «link twice»)", () => {
  const offline = () => {
    throw new TypeError("Load failed"); // iOS cuts a background tab's requests
  };
  const restarting = () =>
    new Response("<html>Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
  const gone = () =>
    new Response(JSON.stringify({ error: "La vinculación venció. Intenta otra vez.", code: "link_expired" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  const start = async () => {
    act(() => useSelfStore.getState().openDialog());
    fireEvent.change(await screen.findByLabelText("Número sin el +51"), { target: { value: "912345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Obtener código/ }));
  };

  it("failed checks while away (offline, server restarting) don't end the link: it finishes and the session is kept", async () => {
    mount([
      { state: "code", code: "ABCD-EFGH" },
      offline,
      offline,
      restarting,
      { state: "linked", session: "s2.ok", me: null },
    ]);
    await start();
    expect(await screen.findByText("ABCD-EFGH", {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("¡Listo, WhatsApp vinculado!", {}, { timeout: 12_000 })).toBeTruthy();
    expect(screen.queryByText(/venció/)).toBeNull();
    expect(useSelfStore.getState().session).toBe("s2.ok");
  }, 20_000);

  it("coming back to the tab checks right away (no waiting for the next poll)", async () => {
    const { client } = mount([
      { state: "code", code: "ABCD-EFGH" },
      offline,
      { state: "linked", session: "s2.back", me: null },
    ]);
    void client;
    await start();
    expect(await screen.findByText("ABCD-EFGH", {}, { timeout: 3000 })).toBeTruthy();
    const fetches = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(
      () => expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(fetches),
      {
        timeout: 500,
      },
    );
  }, 15_000);

  it("only the server saying the link is gone (404) ends it", async () => {
    mount([{ state: "code", code: "ABCD-EFGH" }, gone]);
    await start();
    expect(await screen.findByText(/La vinculación venció/, {}, { timeout: 4000 })).toBeTruthy();
    expect(useSelfStore.getState().session).toBeNull();
  }, 15_000);
});
