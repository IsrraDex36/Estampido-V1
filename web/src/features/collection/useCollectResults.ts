import { useEffect } from "react";
import { useConverterStore } from "../converter/store/converterStore";
import { toItem, useCollectionStore } from "./collectionStore";

const PRUNE_MS = 30_000;

/**
 * Bridge (collection depends on converter, never the reverse): every finished
 * conversion lands in the collection; expired items are pruned periodically.
 */
export function useCollectResults(): void {
  useEffect(() => {
    const unsubscribe = useConverterStore.subscribe((state, prev) => {
      if (state.status.kind === "done" && state.status !== prev.status) {
        useCollectionStore.getState().add(toItem(state.status.result));
      }
    });
    const prune = () => useCollectionStore.getState().prune();
    prune();
    const id = setInterval(prune, PRUNE_MS);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, []);
}
