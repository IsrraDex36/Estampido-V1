/*
 * Estampido service worker — deliberately tiny. Its only job is the Web
 * Share Target: Android's «Compartir» → Estampido POSTs the file to
 * /compartir; we keep it in a cache and open the app, which picks it up.
 * Nothing else is cached or intercepted (the app stays always fresh).
 */
const SHARE_CACHE = "estampido-share";
const SHARE_KEY = "/__shared__/media";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/compartir") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.getAll("media").find((f) => f instanceof File && f.size > 0);
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: {
                "content-type": file.type || "application/octet-stream",
                "x-file-name": encodeURIComponent(file.name || "compartido"),
              },
            }),
          );
        }
      } catch {
        // fall through: open the app anyway
      }
      return Response.redirect("/", 303);
    })(),
  );
});
