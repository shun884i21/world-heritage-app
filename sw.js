// 世界遺産ずかん Service Worker
const CACHE = "wh-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./data/sites.json",
  "./data/trivia.json",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  // cache:"reload" でブラウザのHTTPキャッシュを飛ばし、必ずネットワークから最新を取る
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => fetch(u, { cache: "reload" }).then((res) => { if (res.ok) return c.put(u, res); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 同一オリジンのみキャッシュ対象（写真・地図タイル等の外部はネット直）
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // 成功レスポンスのみキャッシュ（404等の失敗を焼き付けない）
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
