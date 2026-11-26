import type { QueryClient } from "@tanstack/react-query";
import { communityQueries } from "./api/queries";
import { DEFAULT_FILTERS, parseFilters } from "./store/filters";

/** The community page's code (same specifier as the lazy route → one shared chunk). */
export const loadCommunityPage = () => import("./CommunityPage");

/**
 * Warm everything /comunidad shows first, on intent (hover, focus, touch on
 * the nav link): its JS chunk and the first feed page, ranking and stats
 * (the default «Stickers» tab; other tabs load when opened). Respects staleTime, so repeated hovers cost nothing. Errors are
 * ignored here: the page itself shows them if they persist.
 */
export function prefetchCommunity(qc: QueryClient, search = ""): void {
  void loadCommunityPage().catch(() => {});
  const filters = search ? parseFilters(search) : DEFAULT_FILTERS;
  void qc.prefetchInfiniteQuery(communityQueries.feed(filters));
  void qc.prefetchQuery(communityQueries.ranking());
  void qc.prefetchQuery(communityQueries.stats());
}
