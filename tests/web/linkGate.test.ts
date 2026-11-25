// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLinkGate } from "../../web/src/features/bot/useLinkGate.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

afterEach(() => vi.unstubAllGlobals());

function setup(link: unknown, status: Record<string, unknown> = { available: true, connected: true }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (u: RequestInfo | URL) =>
        new Response(JSON.stringify(String(u).includes("/link") ? link : status), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  client.setDefaultOptions({ queries: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe("useLinkGate", () => {
  it("linked → runs the action immediately", async () => {
    const { wrapper } = setup({ state: "linked", phone: "…1234", linkedAt: 1 });
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    await waitFor(() => expect(result.current.linked).toBe(true));
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.dialog.open).toBe(false);
    expect(result.current.phone).toBe("…1234");
  });

  it("not linked → opens the dialog; runs once the link lands; closing drops it", async () => {
    const { client, wrapper } = setup({ state: "unlinked" });
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    await waitFor(() => expect(client.getQueryData(queryKeys.bot.link)).toEqual({ state: "unlinked" }));
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.dialog.open).toBe(true);

    act(() => client.setQueryData(queryKeys.bot.link, { state: "linked", phone: "…9999", linkedAt: 2 }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(result.current.dialog.open).toBe(false);

    // A cancelled attempt never fires later.
    act(() => client.setQueryData(queryKeys.bot.link, { state: "unlinked" }));
    // TanStack notifies observers on the next tick: wait for the hook to see it.
    await waitFor(() => expect(result.current.linked).toBe(false));
    const other = vi.fn();
    act(() => result.current.gate(other));
    act(() => result.current.dialog.onOpenChange(false));
    act(() => client.setQueryData(queryKeys.bot.link, { state: "linked", phone: "…9999", linkedAt: 3 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(other).not.toHaveBeenCalled();
  });

  it("owner's local mode (selfSend) → runs immediately without linking", async () => {
    const { client, wrapper } = setup({ state: "unlinked" }, { available: true, connected: true, selfSend: true });
    const { result } = renderHook(() => useLinkGate(), { wrapper });
    await waitFor(() => expect(client.getQueryData(queryKeys.bot.status)).toMatchObject({ selfSend: true }));
    const action = vi.fn();
    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.dialog.open).toBe(false);
  });
});
