import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError, sendToWhatsApp: vi.fn() }));

const { useCollectionStore, toItem, MAX_ITEMS, selectSelectedItems } = await import(
  "../../web/src/features/collection/collectionStore.js"
);
const { runBatch } = await import("../../web/src/features/collection/batch.js");

const result = (id: string, expiresInMs = 60_000) =>
  ({
    id,
    sticker: { url: `/api/results/${id}/sticker.webp`, animated: true },
    audio: { url: `/api/results/${id}/sticker.ogg`, durationSec: 4 },
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  }) as never;

const initial = useCollectionStore.getState();
beforeEach(() => useCollectionStore.setState({ ...initial, items: [], selected: [] }, true));

describe("collection store", () => {
  it("adds newest first, selected by default, de-duplicated", () => {
    const s = useCollectionStore.getState();
    s.add(toItem(result("a")));
    s.add(toItem(result("b")));
    s.add(toItem(result("a")));
    const st = useCollectionStore.getState();
    expect(st.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(st.selected.sort()).toEqual(["a", "b"]);
    expect(st.items[0]).toMatchObject({ audioUrl: "/api/results/b/sticker.ogg", soundSec: 4, animated: true });
  });

  it("caps the collection and drops selection of evicted items", () => {
    const s = useCollectionStore.getState();
    for (let i = 0; i < MAX_ITEMS + 3; i++) s.add(toItem(result(`r${i}`)));
    const st = useCollectionStore.getState();
    expect(st.items).toHaveLength(MAX_ITEMS);
    expect(st.selected.every((id) => st.items.some((i) => i.id === id))).toBe(true);
  });

  it("toggle / selectAll / clear / remove; selected items keep display order", () => {
    const s = useCollectionStore.getState();
    for (const id of ["a", "b", "c"]) s.add(toItem(result(id)));
    s.clearSelection();
    s.toggle("a");
    s.toggle("c");
    expect(selectSelectedItems(useCollectionStore.getState()).map((i) => i.id)).toEqual(["c", "a"]);
    s.remove(["c"]);
    expect(useCollectionStore.getState()).toMatchObject({ selected: ["a"] });
    s.selectAll();
    expect(useCollectionStore.getState().selected).toEqual(["b", "a"]);
  });

  it("prunes items whose files expired", () => {
    const s = useCollectionStore.getState();
    s.add(toItem(result("old", 1_000)));
    s.add(toItem(result("new", 600_000)));
    s.prune(Date.now() + 5_000);
    expect(useCollectionStore.getState().items.map((i) => i.id)).toEqual(["new"]);
  });
});

describe("runBatch", () => {
  const sleep = async () => {};

  it("sends in order with progress", async () => {
    const order: string[] = [];
    const progress: number[] = [];
    const r = await runBatch(["a", "b", "c"], async (id) => void order.push(id), {
      sleep,
      onProgress: (d) => progress.push(d),
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(progress).toEqual([1, 2, 3]);
    expect(r).toEqual({ sent: 3, failed: 0, total: 3, stoppedReason: undefined });
  });

  it("keeps going on a per-item failure (e.g. expired), stops when the bot is gone", async () => {
    const r1 = await runBatch(
      ["a", "b", "c"],
      async (id) => {
        if (id === "b") throw new FakeApiError("expiró", "expired", 404);
      },
      { sleep },
    );
    expect(r1).toMatchObject({ sent: 2, failed: 1 });

    const calls: string[] = [];
    const r2 = await runBatch(
      ["a", "b", "c"],
      async (id) => {
        calls.push(id);
        if (id === "b") throw new FakeApiError("Bot apagado", "bot_unavailable", 503);
      },
      { sleep },
    );
    expect(calls).toEqual(["a", "b"]);
    expect(r2).toMatchObject({ sent: 1, failed: 1, stoppedReason: "Bot apagado" });
  });

  it("cancellation stops before the next send", async () => {
    let cancelled = false;
    const calls: string[] = [];
    const r = await runBatch(
      ["a", "b", "c"],
      async (id) => {
        calls.push(id);
        cancelled = true;
      },
      { sleep, isCancelled: () => cancelled },
    );
    expect(calls).toEqual(["a"]);
    expect(r.stoppedReason).toBe("Cancelado.");
  });
});
