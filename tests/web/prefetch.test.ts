// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../web/src/features/community/CommunityPage", () => ({ default: () => null }));

const { prefetchCommunity } = await import("../../web/src/features/community/prefetch.js");
const { communityQueries } = await import("../../web/src/features/community/api/queries.js");
const { createQueryClient } = await import("../../web/src/lib/query/client.js");
const { DEFAULT_FILTERS } = await import("../../web/src/features/community/store/filters.js");

afterEach(() => vi.unstubAllGlobals());

function stubApi() {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    const body = u.includes("/stats")
      ? { stickers: 3, sounds: 2, downloads: 9 }
      : { items: [{ id: u.includes("sounds") ? "snd" : "stk" }], nextCursor: null };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("prefetchCommunity", () => {
  it("warms exactly what the default «Stickers» tab reads (feed, ranking, stats); other tabs load when opened", async () => {
    stubApi();
    const qc = createQueryClient({ success: vi.fn(), error: vi.fn() });
    prefetchCommunity(qc);
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(qc.getQueryData(communityQueries.feed(DEFAULT_FILTERS).queryKey)?.pages[0]?.items[0]?.id).toBe("stk");
    expect(qc.getQueryData(communityQueries.stats().queryKey)).toEqual({ stickers: 3, sounds: 2, downloads: 9 });
    expect(qc.getQueryData(communityQueries.sounds({ sort: "top", q: "", limit: 5 }).queryKey)).toBeUndefined();
    expect(qc.getQueryData(communityQueries.ranking().queryKey)).toBeTruthy();
  });

  it("respects staleTime: a second hover doesn't refetch", async () => {
    const fetch = stubApi();
    const qc = createQueryClient({ success: vi.fn(), error: vi.fn() });
    prefetchCommunity(qc);
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    const calls = fetch.mock.calls.length;
    prefetchCommunity(qc);
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("uses the filters from a shared link (?orden=top&cat=memes)", async () => {
    const fetch = stubApi();
    const qc = createQueryClient({ success: vi.fn(), error: vi.fn() });
    prefetchCommunity(qc, "?orden=top&cat=memes&junk=1");
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(fetch.mock.calls.some(([u]) => /stickers\?sort=top&period=week&category=memes/.test(String(u)))).toBe(true);
  });
});
