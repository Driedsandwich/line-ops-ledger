const CACHE_NAME = 'line-ops-ledger-__SW_CACHE_VERSION__';
const APP_SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // ナビゲーションリクエスト: network-first（オフライン時のみ fallback）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/') || caches.match('/offline.html')),
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  // JS/CSS アセット（ハッシュ付きファイル名）: network-first でキャッシュに頼らない
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // その他の静的ファイル（manifest, icon など）: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/offline.html'));
    }),
  );
});
