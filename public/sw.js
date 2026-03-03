const SW_CACHE_NAME = "daily-flow-diary-v2";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  OFFLINE_URL
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SW_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SW_CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

const isNavigationRequest = (request) => request.mode === "navigate" && request.method === "GET";

const isStaticRequest = (request) => {
  if (request.method !== "GET") return false;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return false;
  return (
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|ttf|json)$/.test(requestUrl.pathname)
  );
};

const cacheResponse = async (request, response) => {
  if (!response || !response.ok) return;
  const cache = await caches.open(SW_CACHE_NAME);
  await cache.put(request, response.clone());
};

const networkFirst = async (request) => {
  const cache = await caches.open(SW_CACHE_NAME);
  try {
    const response = await fetch(request);
    await cacheResponse(request, response);
    return response;
  } catch {
    return (await cache.match(request)) ?? new Response("", { status: 503, statusText: "Offline" });
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(SW_CACHE_NAME);
  const cached = await cache.match(request);
  const updatePromise = fetch(request)
    .then((response) => {
      void cacheResponse(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    void updatePromise;
    return cached;
  }

  return (await updatePromise) || (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || new Response("", { status: 503, statusText: "Offline" });
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SW_CACHE_NAME);
        try {
          const response = await fetch(request);
          await cacheResponse(request, response);
          return response;
        } catch {
          return (
            (await cache.match(request)) ??
            (await cache.match(OFFLINE_URL)) ??
            new Response("", { status: 503, statusText: "Offline" })
          );
        }
      })()
    );
    return;
  }

  if (isStaticRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(
    networkFirst(request).catch(() => new Response("", { status: 408 }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
