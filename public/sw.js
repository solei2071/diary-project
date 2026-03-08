const SW_CACHE_NAME = "daily-flow-diary-v4";
const OFFLINE_URL = "/offline.html";
const IS_LOCAL_DEV_HOST = ["localhost", "127.0.0.1", "::1"].includes(self.location.hostname);

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
  if (IS_LOCAL_DEV_HOST) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(SW_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  if (IS_LOCAL_DEV_HOST) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
    return;
  }

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
    requestUrl.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|ttf|json)$/.test(requestUrl.pathname)
  );
};

const isNextStaticChunkRequest = (request) => {
  if (request.method !== "GET") return false;
  const requestUrl = new URL(request.url);
  return requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith("/_next/static/");
};

const isHtmlResponse = (response) => {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
};

const cacheResponse = async (request, response) => {
  if (!response || !response.ok) return;
  // 정적 리소스 요청에 HTML(오류 페이지/오프라인 페이지)이 섞여 캐시되면
  // 이후 JS/CSS MIME 오류가 반복되므로 저장하지 않는다.
  if (isStaticRequest(request) && isHtmlResponse(response)) return;
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

  // 정적 리소스(js/css/font/image)는 오프라인 HTML을 반환하면 브라우저가 파싱 실패한다.
  return (await updatePromise) || (await cache.match(request)) || new Response("", { status: 503, statusText: "Offline" });
};

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_DEV_HOST) {
    return;
  }

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

  if (isNextStaticChunkRequest(request)) {
    event.respondWith(networkFirst(request));
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
  if (IS_LOCAL_DEV_HOST) {
    return;
  }

  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
