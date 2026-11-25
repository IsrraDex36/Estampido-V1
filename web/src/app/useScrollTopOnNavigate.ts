import { useEffect } from "react";
import { useLocation } from "wouter";

/** New page → start at the top (SPA navigation keeps the old scroll otherwise). */
export function useScrollTopOnNavigate(): void {
  const [location] = useLocation();
  // runs on every location change by design
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location]);
}
