import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { notify } from "@/lib/notify";
import { canonicalUrl } from "./url";

/**
 * Mount once (app shell). Replaces the address bar with the canonical URL
 * (no history entry) whenever it isn't: wrong case, stray slashes, aliases,
 * unknown or invalid query params. Pages then only ever see clean input.
 */
export function useCanonicalUrl(): void {
  const [pathname, navigate] = useLocation();
  const search = useSearch();

  useEffect(() => {
    const url = canonicalUrl(pathname, search);
    if (url.invalidSound) notify.error("Ese enlace de sonido no es válido.", { id: "invalid-sound-link" });
    if (url.changed) navigate(url.href, { replace: true });
  }, [pathname, search, navigate]);
}
