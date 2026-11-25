import { type RefObject, useEffect } from "react";
import { useConverterStore } from "../store/converterStore";

/** The result sits below the inputs: bring it into view when a conversion finishes (unless already visible). */
export function useRevealOnDone(ref: RefObject<HTMLElement | null>): void {
  const done = useConverterStore((s) => s.status.kind === "done");
  useEffect(() => {
    const el = ref.current;
    if (!done || !el) return;
    const { top } = el.getBoundingClientRect();
    if (top > window.innerHeight * 0.5 || top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [done, ref]);
}
