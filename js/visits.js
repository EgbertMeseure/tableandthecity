/* Anonymous visit counter over all platforms (website, iPhone app, Android app), via the free, cookieless Abacus counter API
   (https://abacus.jasoncameron.dev, CORS, no account, no cookies). It is not shown on the site; the owner reads it on a private stats page.
   Keys in the namespace 'tableandthecity.com':
     visits            total over all platforms (the existing site counter, so its history is kept)
     visits-web        the website (browsers, the installed PWA)
     visits-ios        the iPhone app (Capacitor)
     visits-android    the Android app (Capacitor)
   Counts at most one visit per device per day: the date of the last counted visit is kept in localStorage (no id, no cookie);
   later page views that day send nothing. Absolute https URLs, so it also works from the apps' local www bundle.
   Any failure (API down, blocked, private mode quirks) is ignored. Local/preview hosts count on separate dev keys. */
(function () {
  'use strict';
  const API = 'https://abacus.jasoncameron.dev', NS = 'tableandthecity.com';
  let platform = 'web';
  try { const p = window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform(); if (p === 'ios' || p === 'android') platform = p; } catch (_) {}
  const live = platform !== 'web' || /(^|\.)tableandthecity\.com$/.test(location.hostname) || /\.github\.io$/.test(location.hostname);   // the apps run from a local bundle (localhost)
  const PRE = live ? 'visits' : 'visits-dev', LS = 'tatc-visit-day';
  const keys = [PRE, `${PRE}-${platform}`];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());   // YYYY-MM-DD
  let last = today; try { last = localStorage.getItem(LS); } catch (_) {}                              // no storage → never count
  if (last === today) { window.TGVisits = { platform, keys, counted: false }; return; }
  try { localStorage.setItem(LS, today); } catch (_) { return; }
  keys.forEach(k => {
    try { fetch(`${API}/hit/${NS}/${k}`, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' }).catch(() => {}); } catch (_) {}
  });
  window.TGVisits = { platform, keys, counted: true };
})();
