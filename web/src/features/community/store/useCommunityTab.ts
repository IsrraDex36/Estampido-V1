import { useCallback } from "react";
import { useSearch } from "wouter";
import { type CommunityTab, parseTab } from "./filters";

export type { CommunityTab } from "./filters";

/**
 * The open community tab lives in the URL (?tab=sonidos): shareable, and the
 * browser's back button returns to the previous tab. Other params (filters)
 * are kept untouched.
 */
export function useCommunityTab(): [CommunityTab, (t: CommunityTab) => void] {
  const search = useSearch();
  const tab = parseTab(search);
  const setTab = useCallback((t: CommunityTab) => {
    const q = new URLSearchParams(window.location.search);
    if (t === "stickers") q.delete("tab");
    else q.set("tab", t);
    const s = q.toString();
    window.history.pushState(window.history.state, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
    // wouter listens to its own navigation events: notify it.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  return [tab, setTab];
}
