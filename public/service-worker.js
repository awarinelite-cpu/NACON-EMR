/* NACON MRS EMR — Service Worker v2.0 — Offline-First */

const CACHE_VERSION = 'nacon-emr-v2';

// App shell resources to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/nacon-crest.png',
];

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Firebase, Auth, or API calls — let them fail naturally offline
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // For navigation requests (HTML pages): network-first, fallback to /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached => cached || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // For JS/CSS/fonts/images: cache-first, then network
  if (
    url.pathname.includes('/static/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|svg|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first, cache as fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Background sync support (if browser supports it) ─────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'nacon-sync-pending') {
    // Notify all open clients to trigger sync
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_REQUESTED' })
        )
      )
    );
  }
});
