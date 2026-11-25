import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../web/src/lib/api.js";
import { errorMessage, isAbort } from "../../web/src/lib/notify.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";
import { queryKeys } from "../../web/src/lib/query/keys.js";

const fakeNotifier = () => ({ success: vi.fn(), error: vi.fn() });
const fail =
  (msg = "boom") =>
  () =>
    Promise.reject(new ApiError(msg, "x", 500));

describe("notify helpers", () => {
  it("maps errors to user messages; network is explicit", () => {
    expect(errorMessage(new ApiError("Sin permiso", "forbidden", 403))).toBe("Sin permiso");
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("No hay conexión con el servidor.");
    expect(errorMessage(null, "fallback")).toBe("fallback");
    expect(isAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbort(new ApiError("x", "aborted", 0))).toBe(true);
  });
});

describe("createQueryClient global feedback", () => {
  it("query errors toast only when data was already on screen", async () => {
    const n = fakeNotifier();
    const qc = createQueryClient(n);
    await qc.fetchQuery({ queryKey: ["a"], queryFn: fail(), retry: false }).catch(() => {});
    expect(n.error).not.toHaveBeenCalled(); // first load: the UI shows it inline

    qc.setQueryData(["b"], 1);
    await qc
      .fetchQuery({ queryKey: ["b"], queryFn: fail("refetch falló"), retry: false, staleTime: 0 })
      .catch(() => {});
    expect(n.error).toHaveBeenCalledTimes(1);
  });

  it("query meta: custom message forces a toast, false silences it", async () => {
    const n = fakeNotifier();
    const qc = createQueryClient(n);
    await qc
      .fetchQuery({ queryKey: ["c"], queryFn: fail(), retry: false, meta: { errorMessage: "Texto propio" } })
      .catch(() => {});
    expect(n.error).toHaveBeenCalledWith(expect.any(ApiError), { fallback: "Texto propio" });
    qc.setQueryData(["d"], 1);
    await qc
      .fetchQuery({ queryKey: ["d"], queryFn: fail(), retry: false, meta: { errorMessage: false } })
      .catch(() => {});
    expect(n.error).toHaveBeenCalledTimes(1);
  });

  it("mutations: errors toast (unless meta false), successMessage toasts, no retry", async () => {
    const n = fakeNotifier();
    const qc = createQueryClient(n);
    const fn = vi.fn(fail("No se pudo publicar"));
    const m = qc.getMutationCache().build(qc, { mutationFn: fn });
    await m.execute(undefined).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(n.error).toHaveBeenCalledWith(expect.objectContaining({ message: "No se pudo publicar" }));

    const silent = qc.getMutationCache().build(qc, { mutationFn: fail(), meta: { errorMessage: false } });
    await silent.execute(undefined).catch(() => {});
    expect(n.error).toHaveBeenCalledTimes(1);

    const ok = qc.getMutationCache().build(qc, { mutationFn: async () => 1, meta: { successMessage: "¡Listo!" } });
    await ok.execute(undefined);
    expect(n.success).toHaveBeenCalledWith("¡Listo!");
  });
});

describe("query keys", () => {
  it("are hierarchical: invalidating ['community'] reaches every community query", async () => {
    const qc = createQueryClient(fakeNotifier());
    const filters = { sort: "hot", period: "week", category: null, query: "" } as const;
    qc.setQueryData(queryKeys.community.feed(filters), { pages: [], pageParams: [] });
    qc.setQueryData(queryKeys.community.stats, { stickers: 1, sounds: 1, uses: 0 });
    qc.setQueryData(queryKeys.bot.status, { available: true, connected: true });
    await qc.invalidateQueries({ queryKey: queryKeys.community.all });
    const states = qc
      .getQueryCache()
      .getAll()
      .map((q) => [q.queryKey[0], q.state.isInvalidated]);
    expect(states).toEqual(
      expect.arrayContaining([
        ["community", true],
        ["bot", false],
      ]),
    );
  });
});
