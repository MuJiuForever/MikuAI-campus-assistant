/* 中野三玖应援页 · Service Worker（PWA 离线可用） */
const CACHE = 'miku-v14-weather-final';
const CORE = ['./', './index.html', './assets/css/style.css', './assets/css/ai.css',
  './assets/js/main.js', './assets/js/ai.js', './manifest.webmanifest',
  './assets/img/icon-192.png', './assets/img/icon-512.png',
  './assets/fonts/miku-hand.woff2', './assets/fonts/miku-hand-chat.woff2', './assets/img/miku-hero.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;           // 接口不缓存
  const isDoc = /\.(html|css|js|webmanifest)$/.test(url.pathname) || url.pathname === '/';
  if (isDoc) {
    // 文档类：网络优先（保证更新能生效），失败时用缓存
    e.respondWith(fetch(req).then((r) => {
      const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r;
    }).catch(() => caches.match(req)));
  } else {
    // 静态资源：缓存优先
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r;
    })));
  }
});
