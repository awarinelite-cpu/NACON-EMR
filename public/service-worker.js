/* NACON MRS EMR — Service Worker v3.0 — Offline-First */

const CACHE_VERSION = 'nacon-emr-v9'; // bumped: forces every device onto the newest build
const CDN_CACHE = 'nacon-cdn-v1'; // icon font + web fonts (survive app updates)

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo48.png',
  '/logo72.png',
  '/logo96.png',
  '/logo128.png',
  '/logo144.png',
  '/logo152.png',
  '/logo192.png',
  '/logo384.png',
  '/logo512.png',
  '/nacon-crest.png',
];

// Pre-cache every JS/CSS file of the current build (listed in the build's
// asset-manifest.json) so the whole app opens offline, even pages that have
// never been visited on this device. Best-effort: never blocks install.
async function precacheBuild(cache) {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json();
    const files = new Set([
      ...(manifest.entrypoints || []).map(f => '/' + f.replace(/^\//, '')),
      ...Object.values(manifest.files || {})
        .filter(f => /\.(js|css)$/.test(f))
        .map(f => (f.startsWith('/') ? f : '/' + f)),
    ]);
    await Promise.all([...files].map(f => cache.add(f).catch(() => {})));
  } catch (_) { /* offline or no manifest — runtime caching still covers it */ }
}

// Icon font (tabler) + Google fonts: needed so icons/text look right offline.
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=DM+Mono:wght@500&display=swap',
];
async function precacheCdn() {
  try {
    const cache = await caches.open(CDN_CACHE);
    await Promise.all(CDN_URLS.map(u =>
      fetch(u, { mode: 'no-cors' }).then(r => cache.put(u, r)).catch(() => {})
    ));
  } catch (_) {}
}
const isCdnHost = h =>
  h.includes('cdn.jsdelivr.net') || h.includes('fonts.googleapis.com') || h.includes('fonts.gstatic.com');

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS).then(() => precacheBuild(cache)))
      .then(() => precacheCdn())
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Icon font + web fonts: serve from cache instantly, refresh in the background
  if (request.method === 'GET' && isCdnHost(url.hostname)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const refresh = fetch(request)
            .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
            .catch(() => cached);
          return cached || refresh;
        })
      )
    );
    return;
  }

  // Never intercept Firebase, Auth, or API calls
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

  // Navigation requests: network-first, fallback to offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })   // always the newest index.html, never the browser's HTTP cache
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html')
            .then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // JS/CSS/fonts/images: cache-first, then network
  if (
    url.pathname.includes('/static/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response;
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

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'nacon-sync-pending') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_REQUESTED' })
        )
      )
    );
  }
});

// ── Push notifications (future-ready) ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'NACON MRS', {
      body: data.body || '',
      icon: '/logo192.png',
      badge: '/logo96.png',
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});

// ── Skip waiting on demand (triggered by index.html update logic) ─────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
