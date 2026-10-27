/* ChankArts Metronome — offline cache (service worker)
 *
 * Strategy:
 *   - HTML / JS / CSS / manifest  → network-first (fresh code on every
 *     reload; cache is the offline fallback)
 *   - images / sounds             → cache-first (immutable, rarely change)
 * Bump CACHE_NAME when assets (images/sounds) change.
 */

const CACHE_NAME = 'chankarts-metronome-v2';

const PRECACHE_URLS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'assets/sounds/click_strong.wav',
  'assets/sounds/click_regular.wav',
  'assets/images/logo_256.png',
  'assets/images/labs_512.png',
  'assets/images/favicon.png',
  'assets/images/icons/icon-192.png',
  'assets/images/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isCodeRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    /\.(js|css|webmanifest)$/.test(url.pathname)
  );
}

async function putInCache(request, response) {
  const copy = response.clone();
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, copy);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await putInCache(request, response);
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await putInCache(request, response);
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    isCodeRequest(event.request, url)
      ? networkFirst(event.request)
      : cacheFirst(event.request)
  );
});
