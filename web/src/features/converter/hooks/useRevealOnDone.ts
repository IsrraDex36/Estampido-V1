import { type RefObject, useEffect } from "react";
import { useConverterStore } from "../store/converterStore";

/** On narrow layouts, scroll the result into view when a conversion finishes. */
export function useRevealOnDone(ref: RefObject<HTMLElement | null>): void {
  const done = useConverterStore((s) => s.status.kind === "done");
  useEffect(() => {
    if (done && window.matchMedia("(max-width: 1023px)").matches) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [done, ref]);
}
