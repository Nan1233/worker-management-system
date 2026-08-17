const BUILD_VERSION = "1.8.21-web-redesign-20260817";
const APP_CACHE = `ktc-${BUILD_VERSION}-app`;
const STATIC_CACHE = `ktc-${BUILD_VERSION}-static`;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== APP_CACHE && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
