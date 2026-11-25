import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { type Notifier, notify } from "../notify";

/** Per-query / per-mutation hints for the global handlers (typed via Register below). */
export interface AppMeta extends Record<string, unknown> {
  /** Custom error toast text; `false` = the component handles the error itself. */
  errorMessage?: string | false;
  /** Toast shown when a mutation succeeds. */
  successMessage?: string;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

/**
 * The app's QueryClient. Defaults (see docs/ESTADO.md):
 * - queries: staleTime 30 s, 1 retry, no refetch on window focus
 * - mutations: no retry (publishing/sending must never repeat by itself)
 * Global feedback:
 * - mutation errors → toast unless meta.errorMessage === false
 * - query errors → toast only when data was already on screen (a failed
 *   background refetch); first-load errors are shown inline by the UI
 * - meta.successMessage on a mutation → success toast
 * `notifier` is injectable for tests.
 */
export function createQueryClient(notifier: Notifier = notify): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const custom = query.meta?.errorMessage;
        if (custom === false) return;
        if (query.state.data !== undefined || typeof custom === "string") {
          notifier.error(error, { fallback: typeof custom === "string" ? custom : undefined });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        const custom = mutation.meta?.errorMessage;
        if (custom === false) return;
        notifier.error(typeof custom === "string" ? custom : error);
      },
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const msg = mutation.meta?.successMessage;
        if (msg) notifier.success(msg);
      },
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}
