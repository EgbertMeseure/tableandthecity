/* Table and the City — service worker (PWA offline shell).
   VERSION and PRECACHE below are written by scripts/stamp_assets.py on every build; never edit them by hand.
   A new build → new VERSION → a new cache; the old one is deleted on activate, so each deploy replaces the previous shell.

   Strategy
   - pages (HTML navigations) and data (*.json): network-first, so weekly updates show up; cached copy when offline;
     offline.html when a page was never cached.
   - static assets (css/js/img/fonts/icons, Leaflet from unpkg, Google Fonts): stale-while-revalidate.
   - photos from the media host (img.tableandthecity.com, Cloudflare R2; see js/media.js): stale-while-revalidate, fetched in CORS
     mode (the bucket has a CORS policy) so the cache holds real responses, never padded opaque ones.
   - OpenStreetMap tiles and every other third-party request: not touched (straight to the network, no SW cache) —
     the OSM tile usage policy discourages bulk/offline caching; the browser's normal HTTP cache still applies.
   All paths are relative to this file, so the same worker runs under /tableandthecity/ (GitHub Pages), at a domain root,
   or inside a Capacitor wrapper. */
const VERSION = 'e662eb1744'; // stamped
const PRECACHE = [
 "./",
 "index.html",
 "guide.html",
 "restaurant.html",
 "about.html",
 "privatechef.html",
 "changes.html",
 "privacy.html",
 "offline.html",
 "manifest.webmanifest",
 "favicon.ico",
 "js/media.js?v=e662eb1744",
 "js/i18n.js?v=e662eb1744",
 "vendor/three/three.custom.min.js",
 "css/brand.css?v=e662eb1744",
 "css/world.css?v=e662eb1744",
 "js/world.js?v=e662eb1744",
 "js/config.js?v=e662eb1744",
 "js/forms.js?v=e662eb1744",
 "js/cityreq.js?v=e662eb1744",
 "js/pwa.js?v=e662eb1744",
 "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
 "vendor/leaflet.markercluster/MarkerCluster.css",
 "css/style.css?v=e662eb1744",
 "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
 "vendor/leaflet.markercluster/leaflet.markercluster.js",
 "js/hours.js?v=e662eb1744",
 "js/common.js?v=e662eb1744",
 "js/quotes.js?v=e662eb1744",
 "js/app.js?v=e662eb1744",
 "js/quiz.js?v=e662eb1744",
 "js/suggest.js?v=e662eb1744",
 "js/eventreq.js?v=e662eb1744",
 "js/visits.js?v=e662eb1744",
 "js/features.js?v=e662eb1744",
 "js/detail.js?v=e662eb1744",
 "js/report.js?v=e662eb1744",
 "js/back.js?v=e662eb1744",
 "js/info.js?v=e662eb1744",
 "js/privatechef.js?v=e662eb1744",
 "img/icons/apple-touch-icon.png",
 "img/icons/favicon-16.png",
 "img/icons/favicon-32.png",
 "img/icons/favicon-48.png",
 "img/icons/icon-192.png",
 "img/icons/icon-512.png",
 "img/icons/icon-maskable-1024.png",
 "img/icons/icon-maskable-512.png",
 "data/cities.json?v=e662eb1744"
]; // stamped
const SHELL = `tatc-shell-${VERSION}`, RUNTIME = `tatc-runtime-${VERSION}`;
const SWR_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const MEDIA_HOSTS = ['img.tableandthecity.com'];
const BASE = new URL('./', self.location).href;
const OFFLINE = new URL('offline.html', BASE).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u =>
    c.add(new Request(new URL(u, BASE).href, { cache: 'reload' })).catch(() => {}))))   // one missing file must not break install
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tatc-') && k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromCache(req, ignoreSearch) {
  return (await caches.match(req)) || (ignoreSearch ? caches.match(req, { ignoreSearch: true }) : undefined);
}

async function networkFirst(req, isPage) {
  try {
    const res = await fetch(req);
    if (res && res.ok) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); }
    return res;
  } catch (err) {
    const hit = await fromCache(req, true);
    if (hit) return hit;
    if (isPage) return (await caches.match(OFFLINE)) || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
    throw err;
  }
}

async function staleWhileRevalidate(e, req, cors) {
  const hit = await fromCache(req, false);
  const net = (cors ? fetch(req.url, { mode: 'cors', credentials: 'omit' }).catch(() => fetch(req)) : fetch(req)).then(res => {
    if (res && (res.ok || (!cors && res.type === 'opaque'))) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => undefined);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || (await fromCache(req, true)) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(BASE)) return;
    if (req.mode === 'navigate' || /\.html$/.test(url.pathname)) return e.respondWith(networkFirst(req, req.mode === 'navigate'));
    if (/\.(json|webmanifest)$/.test(url.pathname)) return e.respondWith(networkFirst(req, false));
    return e.respondWith(staleWhileRevalidate(e, req));
  }
  if (MEDIA_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(e, req, true));
  if (SWR_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(e, req));
  // everything else (OSM tiles, Google photos, Instagram, analytics…) → browser default, not cached by us
});

// media-host photos are not warmed: the page already has them in its HTTP cache (a no-CORS copy), so warming them in CORS mode would download them twice
const cacheable = u => { try { const x = new URL(u); return x.origin === self.location.origin ? x.href.startsWith(BASE) : SWR_HOSTS.includes(x.hostname); } catch (e) { return false; } };
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d === 'skipWaiting') return self.skipWaiting();
  if (d.type === 'warm' && Array.isArray(d.urls)) {                 // cache what the first (uncontrolled) page load fetched
    e.waitUntil(caches.open(RUNTIME).then(c => Promise.all(d.urls.slice(0, 200).filter(cacheable).map(async u => {
      if (await caches.match(u)) return;
      const cross = new URL(u).origin !== self.location.origin;
      try { const res = await fetch(u, cross ? { mode: 'cors', credentials: 'omit' } : {}); if (res.ok) await c.put(u, res); } catch (err) {}
    }))));
  }
});
