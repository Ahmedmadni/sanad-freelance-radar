/* Sanad PWA: app-shell installation without caching private sessions or job results. */
const CACHE = "sanad-public-assets-v1";
const PUBLIC_ASSETS = ["/app-icon.svg", "/manifest.webmanifest"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("sanad-public-assets-") && key !== CACHE)
      .map((key) => caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin ||
      !PUBLIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) =>
    cached || fetch(event.request)));
});
