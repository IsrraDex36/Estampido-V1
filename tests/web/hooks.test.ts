// @vitest-environment happy-dom
import type { CommunitySound } from "@contract";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBotStatus, useSendToWhatsApp } from "../../web/src/features/bot/api.js";
import { useRecordSoundUse } from "../../web/src/features/community/api/mutations.js";
import { useStickerFeed } from "../../web/src/features/community/api/queries.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

/** Fresh client per test (TanStack testing guide): no retries, fake notifier. */
function setup() {
  const notifier = { success: vi.fn(), error: vi.fn() };
  const client = createQueryClient(notifier);
  client.setDefaultOptions({ queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, notifier, wrapper };
}

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;
function mockFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const r = route(url, init);
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bot status (useQuery)", () => {
  it("one request for many readers (shared cache)", async () => {
    const fetch = mockFetch((u) =>
      u.endsWith("/api/whatsapp/status") ? { body: { available: true, connected: true } } : undefined,
    );
    const { wrapper } = setup();
    const { result, unmount } = renderHook(() => [useBotStatus(), useBotStatus(), useBotStatus()], { wrapper });
    await waitFor(() => expect(result.current[0]).toEqual({ available: true, connected: true }));
    expect(result.current[2]).toEqual(result.current[0]);
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("send to WhatsApp (useMutation)", () => {
  it("API error → global toast with its message, and the bot is re-checked", async () => {
    const fetch = mockFetch((u) => {
      if (u.endsWith("/whatsapp"))
        return { status: 503, body: { error: { code: "bot_unavailable", message: "El bot no está corriendo." } } };
      if (u.endsWith("/api/whatsapp/status")) return { body: { available: false, connected: false } };
      return undefined;
    });
    const { client, notifier, wrapper } = setup();
    client.setQueryData(queryKeys.bot.status, { available: true, connected: true });
    const { result } = renderHook(() => useSendToWhatsApp(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("00000000-0000-0000-0000-000000000000").catch(() => {});
    });
    expect(notifier.error).toHaveBeenCalledWith(expect.objectContaining({ message: "El bot no está corriendo." }));
    expect(client.getQueryState(queryKeys.bot.status)?.isInvalidated).toBe(true);
    expect(fetch.mock.calls.some(([u, init]) => String(u).endsWith("/whatsapp") && init?.method === "POST")).toBe(true);
  });
});

describe("community feed (useInfiniteQuery)", () => {
  it("first page, then fetchNextPage with the cursor; pages concatenate", async () => {
    const fetch = mockFetch((u) => {
      const q = new URL(u, "http://x").searchParams;
      if (!u.includes("/api/community/stickers")) return undefined;
      return q.get("cursor") === "c1"
        ? { body: { items: [{ id: "3" }], nextCursor: null } }
        : { body: { items: [{ id: "1" }, { id: "2" }], nextCursor: "c1" } };
    });
    const { wrapper } = setup();
    const filters = { sort: "new", period: "week", category: "memes", query: "gato" } as const;
    const { result } = renderHook(() => useStickerFeed(filters), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    const first = new URL(String(fetch.mock.calls[0]?.[0]), "http://x").searchParams;
    expect(Object.fromEntries(first)).toMatchObject({ sort: "new", category: "memes", q: "gato" });

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.items).map((i) => i.id)).toEqual(["1", "2", "3"]),
    );
    expect(String(fetch.mock.calls[1]?.[0])).toContain("cursor=c1");
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe("sound use (optimistic mutation)", () => {
  it("bumps the cached count right away and stays silent on error", async () => {
    mockFetch((u) =>
      u.endsWith("/use") ? { status: 500, body: { error: { code: "x", message: "falló" } } } : { body: {} },
    );
    const { client, notifier, wrapper } = setup();
    const sound = { id: "s1", uses: 4 } as CommunitySound;
    client.setQueryData(queryKeys.community.sound("s1"), sound);
    const { result } = renderHook(() => useRecordSoundUse(), { wrapper });
    act(() => result.current.mutate("s1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<CommunitySound>(queryKeys.community.sound("s1"))?.uses).toBe(5);
    expect(notifier.error).not.toHaveBeenCalled(); // meta.errorMessage: false
  });
});
