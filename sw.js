const CACHE_NAME = 'finance-hub-cache-v11';
const APP_ROOT = new URL('./', self.location.href).toString();
const INDEX_URL = new URL('./index.html', self.location.href).toString();
const MANIFEST_URL = new URL('./manifest.json', self.location.href).toString();
const ICON_SVG_URL = new URL('./assets/icon.svg', self.location.href).toString();
const FAVICON_URL = new URL('./assets/favicon-32.png', self.location.href).toString();
const APPLE_ICON_URL = new URL('./assets/apple-touch-icon.png', self.location.href).toString();
const ICON_192_URL = new URL('./assets/icon-192.png', self.location.href).toString();
const ICON_512_URL = new URL('./assets/icon-512.png', self.location.href).toString();
const ICON_MASKABLE_URL = new URL('./assets/icon-maskable-512.png', self.location.href).toString();
const APP_SHELL = [
  APP_ROOT,
  INDEX_URL,
  MANIFEST_URL,
  ICON_SVG_URL,
  FAVICON_URL,
  APPLE_ICON_URL,
  ICON_192_URL,
  ICON_512_URL,
  ICON_MASKABLE_URL
];

// Scripts and fonts from other sites that the page needs to start. Cached so the app,
// including cloud sync, loads without a connection and catches up once it's back.
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];
const CACHEABLE_ORIGINS = ['https://www.gstatic.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

// Past this, a slow connection is treated like no connection and the cached page is shown.
const NETWORK_TIMEOUT_MS = 4000;

function isCacheable(request) {
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return true;
  // Only static files: never the Firestore or sign-in APIs.
  return CACHEABLE_ORIGINS.includes(url.origin) && (url.origin !== 'https://www.gstatic.com' || url.pathname.startsWith('/firebasejs/'));
}

// Cross-origin files loaded by plain <script>/<link> tags come back opaque (status 0); they are still usable.
function isUsable(response) {
  return response && (response.ok || response.type === 'opaque');
}

function putInCache(request, response) {
  if (!isUsable(response)) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all([
      cache.addAll(APP_SHELL),
      // A failed SDK download must not block the install; it is fetched again on the next visit.
      Promise.allSettled(FIREBASE_SDK.map((url) =>
        fetch(new Request(url, { mode: 'no-cors' })).then((response) => {
          if (isUsable(response)) return cache.put(url, response);
        })
      ))
    ]))
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
  const { request } = event;
  if (request.method !== 'GET') return;

  // Pages: network first so updates show up, falling back to the cached app offline or on a stalled connection.
  if (request.mode === 'navigate') {
    const fromCache = () => caches.match(request).then((cached) => cached || caches.match(INDEX_URL));
    const fromNetwork = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, copy.clone());
          cache.put(INDEX_URL, copy);
        });
      }
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    event.respondWith(
      Promise.race([fromNetwork, timeout.then(fromCache)])
        .then((response) => response || fromNetwork)
        .catch(() => fromCache().then((cached) => cached || fromNetwork))
    );
    return;
  }

  if (!isCacheable(request)) return;

  // Files: serve the cached copy straight away and refresh it in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request).then((response) => {
        putInCache(request, response);
        return response;
      });
      if (cached) {
        event.waitUntil(refresh.catch(() => {}));
        return cached;
      }
      return refresh;
    })
  );
});
