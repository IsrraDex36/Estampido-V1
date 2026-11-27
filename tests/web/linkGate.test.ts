// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkDialog } from "../../web/src/features/bot/LinkDialog.js";
import { useLinkGate } from "../../web/src/features/bot/useLinkGate.js";
import { useSelfStore } from "../../web/src/features/self/selfStore.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

beforeEach(() => useSelfStore.setState({ session: null, linkedAt: null, dialog: { open: false } }));
afterEach(() => vi.unstubAllGlobals());

function setup(status: Record<string, unknown> = { available: true, connected: false }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: RequestInfo | URL) =>
      String(u).includes("/auth/session")
        ? new Response(JSON.stringify({ me: null }), { headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify(status), { headers: { "content-type": "application/json" } }),
    ),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  client.setDefaultOptions({ queries: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe("useLinkGate (your own WhatsApp)", () => {
  it("linked in this browser → runs the action immediately", () => {
    useSelfStore.setState({ session: "s2.abc" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    expect(result.current.linked).toBe(true);
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.dialog.open).toBe(false);
  });

  it("not linked → asks to link; runs once linked; a cancelled attempt never fires later", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.dialog.open).toBe(true);
    act(() => useSelfStore.getState().setSession("s2.new"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(result.current.dialog.open).toBe(false);

    act(() => useSelfStore.getState().setSession(null));
    const other = vi.fn();
    act(() => result.current.gate(other));
    act(() => result.current.dialog.onOpenChange(false));
    act(() => useSelfStore.getState().setSession("s2.again"));
    await new Promise((r) => setTimeout(r, 20));
    expect(other).not.toHaveBeenCalled();
  });

  it("publishing (needsAccount) waits for the account, which linking signs into", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useLinkGate({ needsAccount: true }), { wrapper });
    await waitFor(() => expect(client.getQueryData(queryKeys.account.me)).toBeNull());
    const publish = vi.fn();
    act(() => result.current.gate(publish));
    expect(publish).not.toHaveBeenCalled();
    act(() => client.setQueryData(queryKeys.account.me, { id: "u1", handle: "yo" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });

  it("owner's local mode (selfSend) → runs immediately without linking", async () => {
    const { client, wrapper } = setup({ available: true, connected: true, selfSend: true });
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    await waitFor(() => expect(client.getQueryData(queryKeys.bot.status)).toMatchObject({ selfSend: true }));
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("«Entrar con WhatsApp» opens the own-WhatsApp link (no bot number involved)", () => {
  it("open → shows the one link dialog; closing it reports closed to the caller", () => {
    const onOpenChange = vi.fn();
    const view = render(createElement(LinkDialog, { open: true, onOpenChange }));
    expect(useSelfStore.getState().dialog.open).toBe(true);
    act(() => useSelfStore.getState().closeDialog());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    view.unmount();
  });

  it("closed → does nothing", () => {
    render(createElement(LinkDialog, { open: false, onOpenChange: vi.fn() }));
    expect(useSelfStore.getState().dialog.open).toBe(false);
  });
});
