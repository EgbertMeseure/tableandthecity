/* Table and the City – app-like features, the same code on the website and inside the Capacitor app:
   A. saved places ("♡ Save"), per city (cities strictly separate), kept on the device (localStorage, mirrored to Capacitor Preferences
      in the app); saving also asks the service worker to keep that place page + its data for offline use
   B. location helper for "Near me · open now" (js/app.js): Capacitor Geolocation in the app, browser geolocation on the web;
      the position never leaves the device
   C. "Remind me" on events: in the app a local notification (Capacitor Local Notifications, no push service; set / cancel);
      on the web an .ics calendar file with a reminder alarm */
(function () {
  'use strict';
  const CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const PL = n => (NATIVE && CAP.Plugins && CAP.Plugins[n]) || null;
  const T = (s, v) => (window.TG_I18N && window.TG_I18N.t ? window.TG_I18N.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m));
  const TGx = () => (typeof TG !== 'undefined' ? TG : window.TG) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qp = (u, k) => { try { return new URL(u, location.href).searchParams.get(k); } catch (e) { return null; } };
  const pageCity = () => qp(location.href, 'city') || (document.querySelector('[data-city]') || {}).dataset?.city || 'gent';

  /* ---------- storage (localStorage first; Preferences mirror so iOS/Android cannot silently drop it) ---------- */
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} const P = PL('Preferences'); if (P) P.set({ key: k, value: JSON.stringify(v) }).catch(() => {}); } };
  const FKEY = c => 'tatc-fav:' + c, RKEY = 'tatc-reminders';
  if (PL('Preferences')) {                                            // app start: restore what localStorage lost
    const P = PL('Preferences');
    P.keys().then(({ keys }) => Promise.all((keys || []).filter(k => /^tatc-(fav:|reminders)/.test(k)).map(k => P.get({ key: k }).then(({ value }) => {
      if (value && localStorage.getItem(k) == null) { try { localStorage.setItem(k, value); } catch (e) {} }
    })))).then(() => { document.dispatchEvent(new CustomEvent('tg:favchange')); decorate(); }).catch(() => {});
  }
  const favs = c => LS.get(FKEY(c), []);
  const isFav = (c, id) => favs(c).includes(id);
  function toggleFav(c, id, warm) {
    const f = favs(c), i = f.indexOf(id), on = i < 0;
    if (on) f.push(id); else f.splice(i, 1);
    LS.set(FKEY(c), f);
    if (on && warm) keepOffline(warm);
    document.dispatchEvent(new CustomEvent('tg:favchange', { detail: { city: c, id, on } }));
    toast(on ? T('Saved: it opens offline too') : T('Removed from saved'));
    return on;
  }
  /* offline: hand the service worker the place page + this page's data / script / image URLs (it skips map tiles and cross-site hosts it should not keep) */
  function keepOffline(urls) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    const res = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.startsWith(location.origin) && /\/(data|js|css|vendor)\//.test(u));
    navigator.serviceWorker.controller.postMessage({ type: 'warm', urls: [...urls, ...res].map(u => new URL(u, location.href).href) });
  }

  /* ---------- toast ---------- */
  let tEl = null, tT = 0;
  function toast(msg) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'tg-toast'; tEl.setAttribute('role', 'status'); tEl.setAttribute('aria-live', 'polite'); document.body.appendChild(tEl); }
    tEl.textContent = msg; tEl.classList.add('is-in'); clearTimeout(tT); tT = setTimeout(() => tEl.classList.remove('is-in'), 3200);
  }

  /* ---------- A. hearts on list cards + the place page ---------- */
  const HEART = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8a4.7 4.7 0 0 1 6.6 6.7z"${on ? ' class="on"' : ''}/></svg>`;
  function setBtn(b, on) {
    b.setAttribute('aria-pressed', on); b.classList.toggle('is-on', on);
    const l = b.querySelector('.fav__l'); if (l) l.textContent = on ? T('Saved') : T('Save');
    b.querySelector('svg').outerHTML = HEART(on); b.setAttribute('aria-label', on ? T('Remove from saved') : T('Save this place'));
  }
  function decorate() {
    document.querySelectorAll('a.card[data-id]').forEach(a => {
      const c = qp(a.href, 'city') || pageCity(), id = a.dataset.id;
      let b = a.querySelector('.fav');
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'fav'; b.dataset.i18nSkip = ''; b.innerHTML = HEART(false); a.appendChild(b); }
      if (b.getAttribute('aria-pressed') !== String(isFav(c, id))) setBtn(b, isFav(c, id));
    });
    const cta = document.querySelector('#right .dcta'), id = qp(location.href, 'id');
    if (cta && id && !cta.querySelector('.fav-pill')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pill-btn dark fav-pill';
      b.innerHTML = HEART(false) + '<span class="fav__l">Save</span>'; cta.appendChild(b); setBtn(b, isFav(pageCity(), id));
    }
    remButtons();
    savedNote();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.fav, .fav-pill'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.closest('a.card[data-id]');
    const c = a ? (qp(a.href, 'city') || pageCity()) : pageCity(), id = a ? a.dataset.id : qp(location.href, 'id');
    const img = (a || document).querySelector(a ? '.card__thumb img' : '.dhero img, #hero img');
    const on = toggleFav(c, id, [a ? a.href : location.href, img && img.currentSrc].filter(Boolean));
    setBtn(b, on);
  }, true);
  /* "♡ Saved" filter (js/app.js): quiet explanation when nothing is saved yet + this city's reminders */
  function savedNote() {
    const chip = document.querySelector('[data-toggle="saved"]'), list = document.getElementById('list'); if (!chip || !list) return;
    let n = document.getElementById('fav-note');
    if (chip.getAttribute('aria-pressed') !== 'true') { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.id = 'fav-note'; n.className = 'fav-note'; list.parentNode.insertBefore(n, list); }
    const c = pageCity(), R = reminders().filter(r => r.city === c);
    const html = (favs(c).length ? '' : `<p>${esc(T('Nothing saved in {city} yet. Tap the heart on a place to keep it here, also offline.', { city: cityName() }))}</p>`)
      + (R.length ? `<p class="fav-note__h">${esc(T('Your reminders'))}</p><ul>${R.map(r => `<li><span data-i18n-skip>${esc(r.title)} · ${esc(r.date)}</span> <button type="button" class="linkbtn" data-rem-cancel="${esc(r.key)}">${esc(T('Cancel reminder'))}</button></li>`).join('')}</ul>` : '');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
    n.hidden = !html;
  }
  const cityName = () => { const h = document.querySelector('[data-city-name]'); return (h && h.textContent) || (pageCity()[0].toUpperCase() + pageCity().slice(1)); };

  /* ---------- B. location (used by "Near me · open now" in js/app.js) ---------- */
  async function locate() {
    const G = PL('Geolocation');
    if (G) {
      let p = await G.checkPermissions().catch(() => ({}));
      if (p.location !== 'granted') p = await G.requestPermissions().catch(() => ({}));
      if (p.location === 'denied') throw { denied: true };
      const pos = await G.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }).catch(err => { throw { denied: /denied|permission/i.test(String(err && err.message)) }; });
      return [pos.coords.latitude, pos.coords.longitude];
    }
    if (!navigator.geolocation) throw { denied: false };
    const once = t => new Promise((ok, no) => navigator.geolocation.getCurrentPosition(p => ok([p.coords.latitude, p.coords.longitude]), err => no({ denied: !!err && err.code === 1, code: err && err.code }), { timeout: t, maximumAge: 120000 }));
    // a first fix can time out while the browser warms up its location source; try once more before giving up
    return once(6000).catch(e => { if (e.denied) throw e; return once(10000); });
  }

  /* ---------- C. event reminders ---------- */
  const reminders = () => LS.get(RKEY, []).filter(r => r.at > Date.now());
  const notifId = k => { let h = 7; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 + 1; };
  const timeOf = e => { const m = String(e.timeStart || e.time || '').match(/^(\d{1,2})[:.h](\d{2})/); return m ? [+m[1], +m[2]] : null; };
  const ymd = s => s.replace(/-/g, '');
  const at = (date, h, m, dayOffset = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d + dayOffset, h, m).getTime(); };   // device-local time
  function remButtons() {
    document.querySelectorAll('[data-rem]').forEach(b => {
      const set = reminders().some(r => r.key === b.dataset.rem);
      const t = set ? T('Reminder set') : T('Remind me');
      if (b.textContent !== t) b.textContent = t;
      if (b.classList.contains('is-on') !== set) b.classList.toggle('is-on', set);
      if (b.getAttribute('aria-pressed') !== String(set)) b.setAttribute('aria-pressed', set);
    });
  }
  function menu(btn, items) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'rem-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}">${esc(it.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = (scrollY + r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(scrollX + r.left, scrollX + innerWidth - m.offsetWidth - 8)) + 'px';
    m.addEventListener('click', ev => { const x = ev.target.closest('[data-i]'); if (!x) return; ev.stopPropagation(); closeMenu(); items[+x.dataset.i].run(); });
    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  }
  function closeMenu() { document.querySelectorAll('.rem-menu').forEach(m => m.remove()); }
  async function schedule(e, key, when, label) {
    const N = PL('LocalNotifications');
    let p = await N.checkPermissions().catch(() => ({}));
    if (p.display !== 'granted') p = await N.requestPermissions().catch(() => ({}));
    if (p.display !== 'granted') { toast(T('Notifications are off for this app. Turn them on in your phone settings to get reminders.')); return; }
    const id = notifId(key);
    await N.schedule({ notifications: [{ id, title: e.title, body: [label, e.location].filter(Boolean).join(' · '), schedule: { at: new Date(when), allowWhileIdle: true }, extra: { url: location.href } }] });
    LS.set(RKEY, [...reminders().filter(r => r.key !== key), { key, id, at: when, title: e.title, date: e.dateStart, city: pageCity() }]);
    toast(T('Reminder set')); decorate();
  }
  async function cancel(key) {
    const r = reminders().find(x => x.key === key), N = PL('LocalNotifications');
    if (r && N) await N.cancel({ notifications: [{ id: r.id }] }).catch(() => {});
    LS.set(RKEY, reminders().filter(x => x.key !== key)); toast(T('Reminder cancelled')); decorate();
  }
  function ics(e, key) {
    const tm = timeOf(e), s = x => String(x || '').replace(/\\/g, '\\\\').replace(/[;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const end = e.dateEnd || e.dateStart, d = new Date(end + 'T12:00:00'); d.setDate(d.getDate() + 1);
    const endNext = d.toISOString().slice(0, 10);
    const pad = n => String(n).padStart(2, '0'), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const href = (TGx().evHref && TGx().evHref(e)) || '';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Table and the City//Event reminder//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${key}@tableandthecity.com`, `DTSTAMP:${stamp}`,
      ...(tm ? [`DTSTART;TZID=Europe/Brussels:${ymd(e.dateStart)}T${pad(tm[0])}${pad(tm[1])}00`, `DURATION:PT3H`] : [`DTSTART;VALUE=DATE:${ymd(e.dateStart)}`, `DTEND;VALUE=DATE:${ymd(endNext)}`]),
      `SUMMARY:${s(e.title)}`, e.location ? `LOCATION:${s(e.location)}` : '', href ? `URL:${href}` : '', `DESCRIPTION:${s('Table and the City' + (href ? ' · ' + href : ''))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${s(e.title)}`, `TRIGGER:${tm ? '-PT3H' : '-PT14H'}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    const blob = new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (e.title || 'event').replace(/[^\w]+/g, '-').slice(0, 50) + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(T('Calendar file downloaded: open it to add the event with a reminder.'));
  }
  document.addEventListener('click', ev => {
    const c = ev.target.closest('[data-rem-cancel]'); if (c) { ev.preventDefault(); ev.stopPropagation(); cancel(c.dataset.remCancel); return; }
    const b = ev.target.closest('[data-rem]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const key = b.dataset.rem, e = TGx().EVREG && TGx().EVREG[key]; if (!e || !e.dateStart) return;
    if (!PL('LocalNotifications')) {
      return menu(b, [{ label: T('Add to calendar (.ics)'), run: () => ics(e, key) }]);
    }
    const tm = timeOf(e), now = Date.now(), items = [];
    const dayBefore = at(e.dateStart, 10, 0, -1), sameDay = tm ? at(e.dateStart, tm[0], tm[1]) - 3 * 3600e3 : at(e.dateStart, 10, 0);
    if (dayBefore > now) items.push({ label: T('The day before, 10:00'), run: () => schedule(e, key, dayBefore, T('Tomorrow')) });
    if (sameDay > now) items.push({ label: tm ? T('3 hours before') : T('On the day, 10:00'), run: () => schedule(e, key, sameDay, T('Today')) });
    if (reminders().some(r => r.key === key)) items.push({ label: T('Cancel reminder'), run: () => cancel(key) });
    if (!items.length) { toast(T('This event starts too soon for a reminder.')); return; }
    menu(b, items);
  }, true);

  /* ---------- wiring ---------- */
  let q = false;
  new MutationObserver(() => { if (q) return; q = true; requestAnimationFrame(() => { q = false; decorate(); }); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  document.addEventListener('tg:favchange', () => decorate());
  if (document.readyState !== 'loading') decorate(); else document.addEventListener('DOMContentLoaded', decorate);
  window.TGFeat = { isFav, favs, toggleFav, locate, reminders, cancel, toast, native: NATIVE };
})();
