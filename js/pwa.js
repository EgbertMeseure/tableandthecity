/* PWA: service-worker registration + a small, one-time "install the app" hint on phones.
   - Android/Chrome: uses the beforeinstallprompt event (an "Install" button in the hint).
   - iPhone/iPad Safari: no install API, so a dismissible tip: "Tap Share, then Add to Home Screen".
   - Never on desktop, never when already running as an installed app, never again after it is dismissed (localStorage). */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      // first visit: the page loaded before the worker was in control, so hand it what this page used (fonts, images, Leaflet…)
      // to keep for offline use; the worker itself skips OSM tiles and other third-party hosts
      navigator.serviceWorker.ready.then(reg => {
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => /^https?:/.test(u));
        if (reg.active) reg.active.postMessage({ type: 'warm', urls: [location.href, ...urls] });
      }).catch(() => {});
    });
  }

  const KEY = 'tatc-install-hint';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return 'x'; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  const ua = navigator.userAgent || '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|Line\//.test(ua);
  const phone = (navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/.test(ua) || ios;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (standalone || !phone || !touch || store.get()) return;      // desktop / installed / already dismissed → nothing

  const ICON = 'img/icons/icon-192.png';
  const SHARE = '<svg class="apphint__share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H6v10h12V10h-2"/></svg>';
  let el = null, deferred = null, shown = false;

  function close(reason) {
    if (!el) return;
    store.set(reason || 'dismissed');
    el.classList.remove('is-in'); setTimeout(() => el && el.remove(), 350);
  }
  function show(android) {
    if (shown || store.get() || document.querySelector('.qz.is-open')) return;
    shown = true;
    el = document.createElement('div');
    el.className = 'apphint'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Install Table and the City');
    el.innerHTML = `<img src="${ICON}" alt="" width="40" height="40">
      <div class="apphint__t"><b>Get the Table and the City app</b>
      <span>${android ? 'Add it to your home screen, works offline.' : `Tap ${SHARE} Share, then “Add to Home Screen”.`}</span></div>
      ${android ? '<button type="button" class="apphint__go">Install</button>' : ''}
      <button type="button" class="apphint__x" aria-label="Dismiss">×</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    el.querySelector('.apphint__x').addEventListener('click', () => close('dismissed'));
    const go = el.querySelector('.apphint__go');
    if (go) go.addEventListener('click', async () => {
      if (!deferred) return close('dismissed');
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => ({}));
      deferred = null; close(choice && choice.outcome === 'accepted' ? 'installed' : 'dismissed');
    });
  }
  // show after the visitor has had a moment with the (calm) hero: first scroll or 8 s, whichever comes first
  function later(fn) {
    let done = false; const run = () => { if (done) return; done = true; removeEventListener('scroll', run); fn(); };
    addEventListener('scroll', run, { passive: true, once: true }); setTimeout(run, 8000);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; later(() => show(true)); });
  window.addEventListener('appinstalled', () => { store.set('installed'); close('installed'); });
  if (iosSafari) later(() => show(false));
  window.TG_PWA = { show, close };                                  // for tests / a future "Get the app" menu link
})();
