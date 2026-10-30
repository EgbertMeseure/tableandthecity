/* Table and the City – app-like features, the same code on the website and inside the Capacitor app:
   A. "My table" (the logo-mark button), per city (cities strictly separate): Want to go / Been here, with an own score (1–10) and visit date
      for Been here; kept on the device (localStorage, mirrored to Capacitor Preferences in the app); adding also asks the service worker to keep that place page + its data for offline use
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
    P.keys().then(({ keys }) => Promise.all((keys || []).filter(k => /^tatc-(fav:|mytable:|reminders)/.test(k)).map(k => P.get({ key: k }).then(({ value }) => {
      if (value && localStorage.getItem(k) == null) { try { localStorage.setItem(k, value); } catch (e) {} }
    })))).then(() => { document.dispatchEvent(new CustomEvent('tg:favchange')); decorate(); }).catch(() => {});
  }
  /* My table (per city, on the device only): { [placeId]: { s: 'want' | 'been', r: 0 | 1–10 (own score, 'been' only), d: '' | 'YYYY-MM-DD' (visited), t: added ms } }
     The older 'tatc-fav:<city>' id list (the former "Saved" places) is migrated once into 'want'. */
  const MKEY = c => 'tatc-mytable:' + c;
  function mt(c) {
    let m = LS.get(MKEY(c), null);
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      m = {}; LS.get(FKEY(c), []).forEach((id, i) => { if (typeof id === 'string') m[id] = { s: 'want', r: 0, d: '', t: i }; });
      if (Object.keys(m).length) LS.set(MKEY(c), m);
    }
    return m;
  }
  const entry = (c, id) => mt(c)[id] || null;
  const favs = c => Object.keys(mt(c));
  const isFav = (c, id) => !!entry(c, id);
  const changed = (c, id, on) => document.dispatchEvent(new CustomEvent('tg:favchange', { detail: { city: c, id, on } }));
  function setEntry(c, id, patch) {
    const m = mt(c), cur = m[id] || { s: 'want', r: 0, d: '', t: Date.now() }, e = { ...cur, ...patch };
    if (e.s !== 'been') { e.r = 0; e.d = ''; }
    e.r = Math.max(0, Math.min(10, Math.round(+e.r || 0))); if (!/^\d{4}-\d{2}-\d{2}$/.test(e.d || '')) e.d = '';
    m[id] = e; LS.set(MKEY(c), m); changed(c, id, true); return e;
  }
  function removeEntry(c, id) { const m = mt(c); delete m[id]; LS.set(MKEY(c), m); changed(c, id, false); }
  function toggleFav(c, id, warm) {
    const on = !isFav(c, id);
    if (on) { setEntry(c, id, { s: 'want', t: Date.now() }); if (warm) keepOffline(warm); } else removeEntry(c, id);
    toast(on ? T('Added to My table: it opens offline too') : T('Removed from My table'));
    return on;
  }
  /* the My table view in the guide (chip [data-toggle="saved"]): which tab is open; js/app.js asks mtShows() per place */
  let tab = 'want';
  const mtShows = (c, id) => { const e = entry(c, id); return !!e && e.s === tab; };
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

  /* ---------- A. My table: the logo-mark button on list cards + the place page, the Want to go / Been here panel, the guide view ---------- */
  // simplified mark of the site's logo (table top, stem, base ellipse; img/brand/favicon.svg): outline when not added, gold + filled base when added
  const MARK = (on, cls = '') => `<svg class="mt-mark${cls ? ' ' + cls : ''}${on ? ' on' : ''}" viewBox="3 4.5 26 24" aria-hidden="true"><ellipse class="mt-mark__fill" cx="16" cy="23.1" rx="10.6" ry="3.4"/><path d="M5 7H27M16 7V22.4"/><path d="M22.8 26.6C26 25.8 27.6 24.6 27 23.2 26.2 21 21.4 19.5 16 19.5S5.8 21 5 23.2C4.4 24.6 6 25.8 9.2 26.6"/></svg>`;
  function setBtn(b, on) {
    b.setAttribute('aria-pressed', on); b.classList.toggle('is-on', on);
    b.innerHTML = MARK(on);                                            // icon only; the words live in aria-label / title
    const t = on ? T('On My table') : T('Add to My table'); b.setAttribute('aria-label', t); b.title = t;
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  /* place page: shown under the button row only while the place is on My table */
  function panelHtml(e) {
    const seg = ['want', 'been'].map(s => `<button type="button" data-mt-s="${s}" aria-pressed="${e.s === s}">${esc(T(s === 'want' ? 'Want to go' : 'Been here'))}</button>`).join('');
    let been = '';
    if (e.s === 'been') {
      const nums = Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" data-mt-r="${n}" aria-pressed="${e.r === n}" aria-label="${esc(T('Your score: {n}', { n }))}"${e.r && n <= e.r ? ' class="is-fill"' : ''}>${n}</button>`).join('');
      been = `<div class="mt-row"><span class="mt-lab" id="mt-score-l">${esc(T('Your score'))}</span><div class="mt-scale" role="group" aria-labelledby="mt-score-l">${nums}</div></div>
        <div class="mt-row"><label class="mt-lab" for="mt-date">${esc(T('Visited on'))}</label><input class="mt-date" id="mt-date" type="date" max="${today()}" value="${esc(e.d)}" data-mt-d></div>
        <p class="mt-hint">${esc(T('Only you see this, on this device.'))}</p>`;
    }
    return `<div class="mt-seg" role="group" aria-label="${esc(T('My table'))}">${seg}</div>${been}`;
  }
  function panel() {
    const cta = document.querySelector('#right .dcta'), id = qp(location.href, 'id'); if (!cta || !id) return;
    let p = document.getElementById('mt-panel'); const e = entry(pageCity(), id);
    if (!e) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('div'); p.id = 'mt-panel'; p.className = 'mt-panel'; p.dataset.i18nSkip = ''; cta.after(p); }
    const html = panelHtml(e); if (p.dataset.h !== html) { const f = document.activeElement && document.activeElement.closest('#mt-panel') ? document.activeElement.dataset : null;
      p.dataset.h = html; p.innerHTML = html;
      if (f) { const k = f.mtS ? `[data-mt-s="${f.mtS}"]` : f.mtR ? `[data-mt-r="${f.mtR}"]` : f.mtD != null ? '[data-mt-d]' : ''; const x = k && p.querySelector(k); if (x) x.focus({ preventScroll: true }); } }
  }
  /* own score on a list card: the small mark + the number, next to the site's score badge */
  function ownBadge(a, e) {
    const h = a.querySelector('h3'); if (!h) return;
    let s = h.querySelector('.mt-own'); const want = e && e.s === 'been' && e.r ? String(e.r) : '';
    if (!want) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('span'); s.className = 'mt-own'; s.dataset.i18nSkip = ''; h.appendChild(s); }
    if (s.dataset.r !== want) { s.dataset.r = want; s.innerHTML = MARK(true, 'mt-mark--s') + `<b>${want}</b>`; const t = T('Your score: {n}', { n: want }); s.title = t; s.setAttribute('aria-label', t); s.setAttribute('role', 'img'); }
  }
  /* in the My table view, 'Want to go' cards get a quiet "Been here" button (moves the place; the score is given on its page) */
  function viewBtn(a, c, e, inView) {
    let b = a.querySelector('.mt-been'); const show = inView && e && e.s === 'want';
    if (!show) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'mt-been'; b.dataset.i18nSkip = ''; b.textContent = T('Been here'); (a.querySelector('.card__foot') || a).appendChild(b); }
  }
  function decorate() {
    const inView = (document.querySelector('[data-toggle="saved"]') || {}).getAttribute?.('aria-pressed') === 'true';
    document.querySelectorAll('a.card[data-id]').forEach(a => {
      const c = qp(a.href, 'city') || pageCity(), id = a.dataset.id, e = entry(c, id);
      let b = a.querySelector('.fav');
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'fav'; b.dataset.i18nSkip = ''; a.appendChild(b); setBtn(b, !!e); }
      else if (b.getAttribute('aria-pressed') !== String(!!e)) setBtn(b, !!e);
      ownBadge(a, e); viewBtn(a, c, e, inView);
    });
    const cta = document.querySelector('#right .dcta'), id = qp(location.href, 'id');
    if (cta && id) {
      let b = cta.querySelector('.fav-pill');
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'pill-btn dark fav-pill'; b.dataset.i18nSkip = '';
        const after = cta.querySelector('[data-cta="website"]') || cta.querySelector('#reserve');   // right after Website (or where it would be)
        if (after) after.after(b); else cta.prepend(b); setBtn(b, isFav(pageCity(), id));
      } else if (b.getAttribute('aria-pressed') !== String(isFav(pageCity(), id))) setBtn(b, isFav(pageCity(), id));
      panel();
    }
    remButtons();
    savedNote();
  }
  const cardOf = el => el.closest('a.card[data-id]');
  const where = el => { const a = cardOf(el); return { a, c: a ? (qp(a.href, 'city') || pageCity()) : pageCity(), id: a ? a.dataset.id : qp(location.href, 'id') }; };
  document.addEventListener('click', ev => {
    const t = ev.target;
    const tb = t.closest('[data-mt-tab]'); if (tb) { ev.preventDefault(); tab = tb.dataset.mtTab; changed(pageCity(), '', true); return; }
    const vb = t.closest('.mt-been'); if (vb) { ev.preventDefault(); ev.stopPropagation(); const { c, id } = where(vb); setEntry(c, id, { s: 'been' }); toast(T('Moved to Been here: give it your score on its page')); return; }
    const sb = t.closest('[data-mt-s]'); if (sb) { ev.preventDefault(); const { c, id } = where(sb); setEntry(c, id, { s: sb.dataset.mtS }); return; }
    const rb = t.closest('[data-mt-r]'); if (rb) { ev.preventDefault(); const { c, id } = where(rb), n = +rb.dataset.mtR, e = entry(c, id); setEntry(c, id, { r: e && e.r === n ? 0 : n }); return; }
    const b = t.closest('.fav, .fav-pill'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const { a, c, id } = where(b);
    const img = (a || document).querySelector(a ? '.card__thumb img' : '.dhero img, #hero img');
    const on = toggleFav(c, id, [a ? a.href : location.href, img && img.currentSrc].filter(Boolean));
    setBtn(b, on);
  }, true);
  document.addEventListener('change', ev => { const d = ev.target.closest && ev.target.closest('[data-mt-d]'); if (!d) return; const { c, id } = where(d); setEntry(c, id, { d: d.value && d.value <= today() ? d.value : '' }); });
  /* the "My table" view (chip in the guide, js/app.js): Want to go / Been here tabs, a quiet line when a tab is empty + this city's reminders */
  function savedNote() {
    const chip = document.querySelector('[data-toggle="saved"]'), list = document.getElementById('list'); if (!chip || !list) return;
    let n = document.getElementById('fav-note');
    if (chip.getAttribute('aria-pressed') !== 'true') { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.id = 'fav-note'; n.className = 'fav-note'; n.dataset.i18nSkip = ''; list.parentNode.insertBefore(n, list); }
    const c = pageCity(), all = Object.values(mt(c)), R = reminders().filter(r => r.city === c);
    const cnt = s => all.filter(e => e.s === s).length;
    const tabs = `<div class="mt-seg mt-tabs" role="group" aria-label="${esc(T('My table'))}">${['want', 'been'].map(s => `<button type="button" data-mt-tab="${s}" aria-pressed="${tab === s}">${esc(T(s === 'want' ? 'Want to go' : 'Been here'))} <b>${cnt(s)}</b></button>`).join('')}</div>`;
    const empty = !all.length ? T('Nothing on My table in {city} yet. Tap the logo on a place to add it, also offline.', { city: cityName() })
      : !cnt(tab) ? (tab === 'want' ? T('Nothing in Want to go yet.') : T('Nothing in Been here yet. Mark a place as Been here on its page or below.')) : '';
    const html = tabs + (empty ? `<p>${esc(empty)}</p>` : '')
      + (R.length ? `<p class="fav-note__h">${esc(T('Your reminders'))}</p><ul>${R.map(r => `<li><span>${esc(r.title)} · ${esc(r.date)}</span> <button type="button" class="linkbtn" data-rem-cancel="${esc(r.key)}">${esc(T('Cancel reminder'))}</button></li>`).join('')}</ul>` : '');
    if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
    n.hidden = false;
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
  window.TGFeat = { isFav, favs, toggleFav, entry, setEntry, removeEntry, mtShows, mtTab: () => tab, locate, reminders, cancel, toast, native: NATIVE };
})();
