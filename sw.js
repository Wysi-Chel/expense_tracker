const CACHE_NAME = 'finance-hub-cache-v3';
const APP_ROOT = new URL('./', self.location.href).toString();
const INDEX_URL = new URL('./index.html', self.location.href).toString();
const MANIFEST_URL = new URL('./manifest.json', self.location.href).toString();
const ICON_SVG_URL = new URL('./assets/icon.svg', self.location.href).toString();
const FAVICON_URL = new URL('./assets/favicon-32.png', self.location.href).toString();
const APPLE_ICON_URL = new URL('./assets/apple-touch-icon.png', self.location.href).toString();
const ICON_192_URL = new URL('./assets/icon-192.png', self.location.href).toString();
const ICON_512_URL = new URL('./assets/icon-512.png', self.location.href).toString();
const APP_SHELL = [
  APP_ROOT,
  INDEX_URL,
  MANIFEST_URL,
  ICON_SVG_URL,
  FAVICON_URL,
  APPLE_ICON_URL,
  ICON_192_URL,
  ICON_512_URL
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy.clone());
            cache.put(INDEX_URL, copy);
          });
          return response;
        })
        .catch(() => (
          caches.match(event.request)
            .then((cached) => cached || caches.match(INDEX_URL))
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request).then((response) => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }))
  );
});
