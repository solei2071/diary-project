const SW_CACHE_NAME = "daily-flow-diary-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  OFFLINE_URL
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SW_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== SW_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

const isNavigationRequest = (request) => request.mode === "navigate" && request.method === "GET";

const isStaticAsset = (request) =>
  request.method === "GET" &&
  request.url.startsWith(self.location.origin) &&
  /\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?|webp|ttf|json)$/.test(new URL(request.url).pathname);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches
              .open(SW_CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => null);
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL);
          })
        )
    );
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(SW_CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
            }
            return response;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request)).catch(() => new Response("", { status: 408 }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
