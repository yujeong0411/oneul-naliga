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
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Web Push 수신 ──
self.addEventListener("push", (e) => {
  if (!e.data) return;
  const payload = e.data.json();
  const title = payload.title || "오늘 날이가";
  const options = {
    body: payload.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: payload,
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── 알림 클릭 시 앱 열기 ──
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const stockCode = e.notification.data?.stock_code;
  const url = stockCode ? `/chart/${stockCode}` : "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        clients.openWindow(url);
      }
    })
  );
});
