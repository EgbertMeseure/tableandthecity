/* Media base URL — the ONE place that says where photos live (Cloudflare R2 bucket tatc-media behind img.tableandthecity.com).
   Loaded synchronously in <head> of every page (before any other script), so window.TG_MEDIA is always there.

   Photos keep their repo-relative path in data/*.json, js and html (img/places/<city>/<id>/p1-1400.webp …); TG_MEDIA.url()
   turns such a path into  MEDIA_BASE + path  at render time. The bucket mirrors the repo paths 1:1 (scripts/sync_media_r2.py).
   Small UI assets stay in the repo and are never rewritten: img/icons/, img/brand/, img/og*.jpg, img/share-card.jpg, img/CREDITS.json.

   Switches (handy for local test servers / offline work):
     ?media=local  → load photos from the site itself (relative paths, as before) — remembered in localStorage
     ?media=r2     → back to the default (MEDIA_BASE)
   Safety net: if a photo from MEDIA_BASE fails to load, the <img> retries once with the relative (in-repo) path,
   as long as the files are still in the repo. */
(function () {
  var MEDIA_BASE = 'https://img.tableandthecity.com/';
  var KEY = 'tatc-media', mode = '';
  try {
    var q = new URLSearchParams(location.search).get('media');
    if (q === 'local') localStorage.setItem(KEY, 'local'); else if (q === 'r2') localStorage.removeItem(KEY);
    mode = localStorage.getItem(KEY) || '';
  } catch (e) {}
  var base = mode === 'local' ? '' : MEDIA_BASE;
  var KEEP = /^img\/(icons\/|brand\/|og[^/]*$|share-card[^/]*$|CREDITS\.json$)/;
  var isMedia = function (p) { return typeof p === 'string' && /^img\//.test(p) && !KEEP.test(p); };
  /* path or URL → URL to load (absolute URLs, data: and kept UI assets pass through unchanged) */
  var url = function (p) { return base && isMedia(p) ? base + p : p; };
  /* "a.webp 800w, b.webp 1600w" → each candidate through url() */
  var srcset = function (s) { return typeof s === 'string' ? s.split(',').map(function (c) { var t = c.trim().split(/\s+/); t[0] = url(t[0]); return t.join(' '); }).join(', ') : s; };
  /* URL from MEDIA_BASE → the repo-relative path (for the fallback, and for code that compares paths) */
  var local = function (u) { return typeof u === 'string' && u.indexOf(MEDIA_BASE) === 0 ? u.slice(MEDIA_BASE.length) : u; };
  window.TG_MEDIA = { BASE: MEDIA_BASE, base: base, url: url, srcset: srcset, local: local, isMedia: isMedia };
  /* fallback: a photo that fails on the media host is retried once from the site (same path) */
  document.addEventListener('error', function (e) {
    var im = e.target;
    if (!im || im.tagName !== 'IMG' || im.dataset.mediaFallback) return;
    var s = im.getAttribute('src') || '';
    if (s.indexOf(MEDIA_BASE) !== 0) return;
    im.dataset.mediaFallback = '1';
    e.stopPropagation();   // the element's own onerror (e.g. "remove the photo, show the monogram") only runs if the local copy fails too
    var ss = im.getAttribute('srcset');
    if (ss) im.setAttribute('srcset', ss.split(MEDIA_BASE).join(''));
    im.setAttribute('src', local(s));
  }, true);
})();
