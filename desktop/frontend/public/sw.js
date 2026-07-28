const VERSION = "ktc-pwa-v1.0.4-auth";
const APP_CACHE = `${VERSION}-app`;
const STATIC_CACHE = `${VERSION}-static`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./offline.html",
  "./pwa/icon-192.png",
  "./pwa/icon-512.png",
  "./pwa/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("worker-management-system-2-5jqv.onrender.com")
  );
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse?.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(APP_CACHE);
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match("./index.html")) ||
      (await caches.match("./offline.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (isApiRequest(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const cacheableDestinations = new Set([
    "script",
    "style",
    "image",
    "font",
  ]);

  if (
    url.origin === self.location.origin &&
    cacheableDestinations.has(request.destination)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
