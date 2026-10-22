const BUILD_VERSION = "1.9.31-worker-accessibility-20261022";
const APP_CACHE = `ktc-${BUILD_VERSION}-app`;
const STATIC_CACHE = `ktc-${BUILD_VERSION}-static`;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./offline.html"];

function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== APP_CACHE && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (isApiRequest(new URL(request.url))) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && new URL(request.url).origin === self.location.origin) {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./offline.html")))
  );
});
