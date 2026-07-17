// Томи Мишка · service worker (минимальный и безопасный)
const CACHE = "tomi-v1";
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // API и не-GET никогда не трогаем
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  // навигация: сеть, при офлайне — оболочка из кэша
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }

  // статика (хэшированные ассеты, иконки, манифест): cache-first + фон-обновление
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((resp) => {
            if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
            return resp;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
