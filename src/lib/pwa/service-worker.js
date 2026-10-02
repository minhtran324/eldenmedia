/* Public assets only. Generated as /sw.js for each production build. */
const CACHE_PREFIX = "elden-public-";
const CACHE_NAME = `${CACHE_PREFIX}__ELDEN_PWA_VERSION__`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_ASSETS = [OFFLINE_URL, "/icons/elden-v2/icon-192.png", "/icons/elden-v2/icon-512.png", "/icons/elden-v2/maskable-512.png", "/icons/elden-v2/apple-touch-icon.png"];

self.addEventListener("install", event => {
  // A new worker waits until the user requests an update or all old tabs close.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ELDEN_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // No offline writes, API responses, OAuth callbacks, Supabase, RSC or photos.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.open(CACHE_NAME).then(cache => cache.match(url.pathname));
      return cached ?? fetch(request);
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Never write authenticated documents to Cache Storage.
        return await fetch(request);
      } catch {
        const cached = await caches.open(CACHE_NAME).then(cache => cache.match(OFFLINE_URL));
        return cached ?? new Response("Elden Media: mat ket noi. Vui long tai lai khi co mang.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
    })());
  }
});
