import { useEffect } from "react";
import { selectBusy, useConverterStore } from "../store/converterStore";

/** Ctrl/⌘ + Enter starts a conversion when a file is ready. */
export function useConvertShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const s = useConverterStore.getState();
      if (!s.file || selectBusy(s)) return;
      e.preventDefault();
      void s.convert();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
