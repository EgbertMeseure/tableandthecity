/* Discreet public visit counter in the footer ("12,345 visits"), via the free, cookieless Abacus counter API
   (https://abacus.jasoncameron.dev, CORS, no account, no cookies). Counts at most one visit per browser per day: the date of the
   last counted visit is kept in localStorage (no id, no cookie); later page views that day only read the value.
   Any failure (API down, blocked, private mode quirks) → the counter simply stays hidden.
   Local/preview hosts count on a separate dev key so testing never inflates the public number. */
(function () {
  'use strict';
  const API = 'https://abacus.jasoncameron.dev', NS = 'tableandthecity.com';
  const live = /(^|\.)tableandthecity\.com$/.test(location.hostname) || /\.github\.io$/.test(location.hostname);
  const KEY = live ? 'visits' : 'visits-dev', LS = 'tatc-visit-day';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());   // YYYY-MM-DD
  let last = null; try { last = localStorage.getItem(LS); } catch (_) { last = today; }                 // no storage → never hit, only read
  const hit = last !== today;
  const ctl = 'AbortController' in window ? new AbortController() : null; if (ctl) setTimeout(() => ctl.abort(), 6000);
  const value = fetch(`${API}/${hit ? 'hit' : 'get'}/${NS}/${KEY}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl && ctl.signal, cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(j => { if (hit) try { localStorage.setItem(LS, today); } catch (_) {} return typeof j.value === 'number' && j.value > 0 ? j.value : Promise.reject('no value'); });
  function paint(n) {
    document.querySelectorAll('[data-visits]').forEach(el => { el.textContent = `${n.toLocaleString('en-GB')} visit${n === 1 ? '' : 's'}`; el.hidden = false; });
  }
  value.then(n => {
    paint(n);
    document.querySelectorAll('[data-footer]').forEach(f => new MutationObserver(() => {   // the footer is (re)rendered after the data loads
      const el = f.querySelector('[data-visits][hidden]'); if (el) paint(n);
    }).observe(f, { childList: true }));
  }).catch(() => {});
  window.TGVisits = { value, key: KEY };
})();
