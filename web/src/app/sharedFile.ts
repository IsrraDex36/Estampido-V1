/**
 * Files shared to Estampido from Android («Compartir» → Estampido) land in a
 * cache written by the service worker (public/sw.js). Take it once.
 */
export const SHARE_CACHE = "estampido-share";
export const SHARE_KEY = "/__shared__/media";

/** The shared file, if any (removed from the cache: one use). */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_KEY);
    if (!res) return null;
    await cache.delete(SHARE_KEY);
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("x-file-name") ?? "compartido");
    return new File([blob], name, { type: res.headers.get("content-type") ?? blob.type });
  } catch {
    return null;
  }
}

/** Register the (tiny) service worker in production. Never throws. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
