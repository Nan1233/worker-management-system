const BUILD_VERSION = "1.9.30-mai-options-filter-20261012";
const APP_CACHE = `ktc-${BUILD_VERSION}-app`;
const STATIC_CACHE = `ktc-${BUILD_VERSION}-static`;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./offline.html"];

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

function isApiRequest(url) {
  const pathname = url.pathname.replace(/\\/+$/, "");
  return pathname === "/api" || pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // API responses can contain worker-specific and management-only data. Never
  // put them in Cache Storage or substitute offline.html for an API response.
  // Cross-origin requests are also left to the browser's normal fetch path.
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./offline.html")))
  );
});
