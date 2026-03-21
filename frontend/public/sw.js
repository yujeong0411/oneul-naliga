const CACHE_NAME = "oneul-naliga-v1";
const STATIC_ASSETS = ["/", "/logo.png"];

// 설치 시 정적 자산 캐시
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 활성화 시 이전 캐시 정리
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시 (API는 캐시 안 함)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // http/https 외 스킴(chrome-extension 등)은 무시
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // API, WebSocket은 캐시하지 않음
  if (url.pathname.startsWith("/api") || url.protocol === "ws:" || url.protocol === "wss:") {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 정적 자산은 캐시에 저장
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
