// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserData, useDeleteAccount, useLogout } from "../../web/src/features/account/api.js";
import { useAccountSync } from "../../web/src/features/account/useAccountSync.js";
import { SELF_STORAGE_KEY, useSelfStore } from "../../web/src/features/self/selfStore.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

const ME = { id: "u1", handle: "ana", displayName: "Ana", avatar: "🦊 #fff", bio: "", createdAt: 1 };
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
const ok = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
let calls: { url: string; body?: string }[];

function setup(route: Route) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(u), body: init?.body as string | undefined });
      return route(String(u), init);
    }),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  client.setDefaultOptions({ queries: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  localStorage.clear();
  useSelfStore.setState({ session: null, linkedAt: null, dialog: { open: false } });
});
afterEach(() => {
  cleanup(); // unmount hooks before the fetch stub goes away (no stray real requests)
  vi.unstubAllGlobals();
});

describe("«Cerrar sesión»", () => {
  it("is instant: forgets the WhatsApp session right away; removing the device never holds the button", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { client, wrapper } = setup((url) => {
      if (url.endsWith("/api/auth/logout")) return ok({ ok: true });
      if (url.endsWith("/api/self/logout")) return new Promise<Response>(() => {}); // WhatsApp never answers
      return ok({ me: null });
    });
    client.setQueryData(queryKeys.account.me, ME);
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(useSelfStore.getState().session).toBeNull();
    expect(client.getQueryData(queryKeys.account.me)).toBeNull();
    expect(calls.map((c) => new URL(c.url, "http://x").pathname)).toEqual(["/api/auth/logout", "/api/self/logout"]);
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({ session: "s2.mine" }); // the device removal got the session
  });

  it("if the server can't sign out, nothing is half-done (session kept, still signed in, error shown)", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { client, wrapper } = setup(() => ok({ error: { code: "x", message: "caído" } }, 503));
    client.setQueryData(queryKeys.account.me, ME);
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    expect(useSelfStore.getState().session).toBe("s2.mine");
    expect(client.getQueryData(queryKeys.account.me)).toEqual(ME);
  });

  it("leaves nothing of the previous account cached (follows, feed, my packs, my stickers)", () => {
    const { client } = setup(() => ok({}));
    for (const k of [
      queryKeys.social.following,
      queryKeys.social.feed,
      queryKeys.social.myPacks(),
      queryKeys.account.stickers,
    ]) {
      client.setQueryData(k, ["private"]);
    }
    client.setQueryData(queryKeys.community.trending, { hot: [], shelves: [] }); // public: kept
    clearUserData(client);
    expect(client.getQueryData(queryKeys.social.following)).toBeUndefined();
    expect(client.getQueryData(queryKeys.social.feed)).toBeUndefined();
    expect(client.getQueryData(queryKeys.social.myPacks())).toBeUndefined();
    expect(client.getQueryData(queryKeys.account.stickers)).toBeUndefined();
    expect(client.getQueryData(queryKeys.account.me)).toBeNull();
    expect(client.getQueryData(queryKeys.community.trending)).toBeDefined();
  });

  it("deleting the account also forgets the WhatsApp session (it can't recreate the account)", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { client, wrapper } = setup((url) => (url.endsWith("/api/me") ? ok({ removed: 2 }) : ok({ ok: true })));
    client.setQueryData(queryKeys.account.me, ME);
    const { result } = renderHook(() => useDeleteAccount(), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(useSelfStore.getState().session).toBeNull();
    expect(client.getQueryData(queryKeys.account.me)).toBeNull();
  });
});

describe("signing in again on its own (useAccountSync)", () => {
  const routeWithSignin = (signin: () => Response) => (url: string) =>
    url.endsWith("/api/self/signin")
      ? signin()
      : url.includes("/api/auth/session")
        ? ok({ me: null })
        : url.includes("/favorites")
          ? ok([])
          : ok({});

  it("linked browser, cookie gone → signed in from the sealed session", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { client, wrapper } = setup(routeWithSignin(() => ok({ me: ME })));
    renderHook(() => useAccountSync(), { wrapper });
    await waitFor(() => expect(client.getQueryData(queryKeys.account.me)).toEqual(ME));
  });

  it("signed out here (revoked) → the useless session is forgotten, no loop", async () => {
    useSelfStore.setState({ session: "s2.old" });
    const { client, wrapper } = setup(
      routeWithSignin(() => ok({ error: { code: "session_revoked", message: "Cerraste sesión" } }, 401)),
    );
    renderHook(() => useAccountSync(), { wrapper });
    await waitFor(() => expect(useSelfStore.getState().session).toBeNull());
    expect(client.getQueryData(queryKeys.account.me)).toBeNull();
    expect(calls.filter((c) => c.url.endsWith("/api/self/signin"))).toHaveLength(1);
  });

  it("server busy / offline → the session is kept (just try another time)", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { wrapper } = setup(routeWithSignin(() => ok({ error: { code: "bot_unavailable", message: "x" } }, 503)));
    renderHook(() => useAccountSync(), { wrapper });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/self/signin"))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(useSelfStore.getState().session).toBe("s2.mine");
  });
});

describe("several tabs", () => {
  it("another tab signs out → this tab drops its in-memory session too (storage event)", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    await new Promise((r) => setTimeout(r, 0));
    // The other tab wrote «no session» to localStorage:
    localStorage.setItem(SELF_STORAGE_KEY, JSON.stringify({ state: { session: null, linkedAt: null }, version: 0 }));
    window.dispatchEvent(new StorageEvent("storage", { key: SELF_STORAGE_KEY }));
    await waitFor(() => expect(useSelfStore.getState().session).toBeNull());
  });

  it("…and re-checks who is signed in, instead of showing the old profile", async () => {
    useSelfStore.setState({ session: "s2.mine" });
    const { client, wrapper } = setup((url) => (url.includes("/api/auth/session") ? ok({ me: null }) : ok([])));
    client.setQueryData(queryKeys.account.me, ME);
    renderHook(() => useAccountSync(), { wrapper });
    act(() => useSelfStore.getState().setSession(null)); // what the storage sync does
    await waitFor(() => expect(client.getQueryData(queryKeys.account.me)).toBeNull());
  });
});
