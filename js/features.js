/* Table and the City – app-like features, the same code on the website and inside the Capacitor app:
   A. "My table" (the logo-mark button), per city (cities strictly separate): Want to go / Been here, with an own score (1–10) and visit date
      for Been here; kept on the device (localStorage, mirrored to Capacitor Preferences in the app); adding also asks the service worker to keep that place page + its data for offline use
   B. location helper for "Near me · open now" (js/app.js): Capacitor Geolocation in the app, browser geolocation on the web;
      the position never leaves the device
   C. "Remind me" on events: in the app a local notification (Capacitor Local Notifications, no push service; set / cancel);
      on the web an .ics calendar file with a reminder alarm
   D. "Want to go with…" on a Want to go place (place page + its card in the My table view): a share link restaurant.html?…&invite=1&from=<first name>;
      no server: the name is only in the link and remembered on the device. Opening such a link shows a small card to add the place, marked 'with <name>' */
(function () {
  'use strict';
  const CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const PL = n => (NATIVE && CAP.Plugins && CAP.Plugins[n]) || null;
  const T = (s, v) => (window.TG_I18N && window.TG_I18N.t ? window.TG_I18N.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m));
  const TGx = () => (typeof TG !== 'undefined' ? TG : window.TG) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qp = (u, k) => { try { return new URL(u, location.href).searchParams.get(k); } catch (e) { return null; } };
  /* a first name from a link or a field: letters, digits, space . ' - only, single spaces, at most 30 characters */
  const cleanName = v => Array.from(String(v == null ? '' : v).normalize('NFC').replace(/[^\p{L}\p{M}\p{N} .'’-]+/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, 30).join('').trim();
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
  /* My table (per city, on the device only): { [placeId]: { s: 'want' | 'been', r: 0 | 1–10 (own score, 'been' only), d: '' | 'YYYY-MM-DD' (visited), t: added ms, w: '' | first name ('Want to go with…') } }
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
    e.w = cleanName(e.w); if (!e.w) delete e.w;
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
    const w = e.w ? `<p class="mt-hint mt-with">${esc(T('with {name}', { name: e.w }))}</p>` : '';
    const inv = e.s === 'want' ? `<button type="button" class="pill-btn dark mt-invite" data-invite>${esc(T('Want to go with…'))}</button>` : '';   // only while in Want to go; the button row above stays as it was
    return `<div class="mt-top"><div class="mt-seg" role="group" aria-label="${esc(T('My table'))}">${seg}</div>${inv}</div>${w}${been}`;
  }
  function panel() {
    const cta = document.querySelector('#right .dcta'), id = qp(location.href, 'id'); if (!cta || !id) return;
    let p = document.getElementById('mt-panel'); const e = entry(pageCity(), id);
    if (!e) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('div'); p.id = 'mt-panel'; p.className = 'mt-panel'; p.dataset.i18nSkip = ''; cta.after(p); }
    const html = panelHtml(e); if (p.dataset.h !== html) { const f = document.activeElement && document.activeElement.closest('#mt-panel') ? document.activeElement.dataset : null;
      p.dataset.h = html; p.innerHTML = html;
      if (f) { const k = f.mtS ? `[data-mt-s="${f.mtS}"]` : f.mtR ? `[data-mt-r="${f.mtR}"]` : f.mtD != null ? '[data-mt-d]' : f.invite != null ? '[data-invite]' : ''; const x = k && p.querySelector(k); if (x) x.focus({ preventScroll: true }); } }
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
    const foot = a.querySelector('.card__foot') || a;
    let n = a.querySelector('.mt-withnote'); const note = inView && e && e.w ? T('with {name}', { name: e.w }) : '';
    if (!note) { if (n) n.remove(); }
    else { if (!n) { n = document.createElement('span'); n.className = 'mt-withnote'; n.dataset.i18nSkip = ''; foot.prepend(n); } if (n.textContent !== note) n.textContent = note; }
    let b = a.querySelector('.mt-been'), w = a.querySelector('.mt-withbtn'); const show = inView && e && e.s === 'want';
    if (!show) { if (b) b.remove(); if (w) w.remove(); return; }
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'mt-been'; b.dataset.i18nSkip = ''; b.textContent = T('Been here'); foot.appendChild(b); }
    if (!w) { w = document.createElement('button'); w.type = 'button'; w.className = 'mt-been mt-withbtn'; w.dataset.i18nSkip = ''; w.dataset.invite = ''; w.textContent = T('Want to go with…'); foot.appendChild(w); }
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
    const ib = t.closest('[data-invite]'); if (ib) { ev.preventDefault(); ev.stopPropagation(); const { a, c, id } = where(ib); openInvite(ib, c, id, a); return; }
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

  /* ---------- D. "Want to go with…": a share link with the sender's first name; the friend's card on the place page ---------- */
  const NKEY = 'tatc-invite-name';
  const placeName = a => { const h = a ? a.querySelector('h3') : document.getElementById('hname'); if (!h) return ''; const x = h.cloneNode(true); x.querySelectorAll('.gscore, .mt-own').forEach(n => n.remove()); return x.textContent.trim(); };
  function inviteUrl(c, id, a, from) {
    const base = new URL(a ? a.href : location.href, location.href), u = new URL('restaurant.html', base);
    const country = base.searchParams.get('country') || qp(location.href, 'country') || 'be';
    u.search = new URLSearchParams({ country, city: c, id, invite: '1', ...(from ? { from } : {}) }).toString();
    return u.href;
  }
  const phone = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
  let iv = null, ivFocus = null;
  function openInvite(btn, c, id, a) {
    closeInvite(true); ivFocus = btn;
    const e = entry(c, id) || {}, me = cleanName(LS.get(NKEY, '')), place = placeName(a);
    iv = document.createElement('div'); iv.className = 'crq mt-iv'; iv.dataset.i18nSkip = '';
    const acts = (phone() ? `<button class="pill-btn crq__send" type="button" data-iv="share">${esc(T('Share'))}</button>` : `<button class="pill-btn crq__send" type="button" data-iv="copy">${esc(T('Copy link'))}</button>`)
      + `<button class="pill-btn dark mt-iv__wa" type="button" data-iv="wa">WhatsApp</button>`;
    iv.innerHTML = `<div class="crq__scrim" data-iv="close"></div>
      <div class="crq__sheet mt-iv__sheet" role="dialog" aria-modal="true" aria-labelledby="mt-iv-t">
        <button class="crq__x" type="button" data-iv="close">${esc(T('Close'))}</button>
        <p class="crq__eyebrow">${esc(place || T('My table'))}</p>
        <h2 class="crq__t" id="mt-iv-t">${esc(T('Want to go with…'))}</h2>
        <p class="crq__lead">${esc(T('Send a link so a friend can add this place to their Want to go.'))}</p>
        <form class="crq__form" novalidate>
          <label class="crq__f"><span>${esc(T('Your first name'))} <i>${esc(T('(optional)'))}</i></span><input name="from" type="text" autocomplete="given-name" maxlength="30" value="${esc(me)}"></label>
          <label class="crq__f"><span>${esc(T('Going with'))} <i>${esc(T('(optional)'))}</i></span><input name="with" type="text" autocomplete="off" maxlength="30" value="${esc(e.w || '')}"></label>
          <div class="mt-iv__acts">${acts}</div>
          <input class="mt-iv__link" type="text" readonly hidden aria-label="${esc(T('Select and copy this link.'))}">
          <p class="crq__note">${esc(T('Your name is only put in the link and remembered on this device.'))}</p>
        </form>
      </div>`;
    document.body.appendChild(iv); document.documentElement.classList.add('crq-lock');
    const f = iv.querySelector('form');
    const go = () => {                                                  // remember the name, mark the own entry, build the link + the message
      const from = cleanName(f.elements.from.value), w = cleanName(f.elements.with.value);
      f.elements.from.value = from; f.elements.with.value = w; LS.set(NKEY, from);
      if (isFav(c, id)) setEntry(c, id, { w });
      const url = inviteUrl(c, id, a, from);
      return { url, text: place ? T('Want to go to {place} with me?', { place }) : T('Want to go here with me?') };
    };
    iv.addEventListener('click', async ev => {
      const x = ev.target.closest('[data-iv]'); if (!x) return; ev.preventDefault();
      const k = x.dataset.iv; if (k === 'close') return closeInvite();
      const { url, text } = go();
      if (k === 'wa') { window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener'); return closeInvite(); }
      if (k === 'share') { try { await navigator.share({ title: 'Table and the City', text, url }); closeInvite(); } catch (err) { if (err && err.name !== 'AbortError') showLink(url); } return; }
      try { await navigator.clipboard.writeText(url); x.textContent = T('Link copied'); toast(T('Link copied')); setTimeout(() => closeInvite(), 900); }
      catch (_) { showLink(url); }
    });
    f.addEventListener('submit', ev => ev.preventDefault());
    iv.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeInvite(); }
      if (ev.key === 'Tab') { const fs = [...iv.querySelectorAll('input, button')].filter(x => x.offsetParent); const i = fs.indexOf(document.activeElement);
        if (ev.shiftKey && i <= 0) { ev.preventDefault(); fs[fs.length - 1].focus(); } else if (!ev.shiftKey && i === fs.length - 1) { ev.preventDefault(); fs[0].focus(); } }
    });
    function showLink(url) { const l = iv.querySelector('.mt-iv__link'); l.hidden = false; l.value = url; l.focus(); l.select(); toast(T('Select and copy this link.')); }
    requestAnimationFrame(() => { iv.classList.add('is-open'); f.elements.from.focus({ preventScroll: true }); });
  }
  function closeInvite(now) {
    if (!iv) return; const el = iv; iv = null; el.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    if (now) el.remove(); else setTimeout(() => el.remove(), 200);
    const back = ivFocus && ivFocus.isConnected ? ivFocus : document.querySelector('#mt-panel [data-invite]');   // the panel may have re-rendered
    if (!now && back) back.focus({ preventScroll: true });
  }
  /* the friend opens the link: a small calm card on the place page; the invite params leave the address bar either way */
  let ivTry = 0;
  function inviteCard() {
    if (qp(location.href, 'invite') !== '1') return;
    const id = qp(location.href, 'id'); if (!id) return;
    if (!document.querySelector('#right .dcta')) { if (++ivTry < 75) setTimeout(inviteCard, 200); return; }   // wait (max 15 s) for the place to render
    if (document.querySelector('.mt-card')) return;
    const c = pageCity(), from = cleanName(qp(location.href, 'from'));
    const k = document.createElement('div'); k.className = 'mt-card'; k.dataset.i18nSkip = ''; k.setAttribute('role', 'dialog'); k.setAttribute('aria-labelledby', 'mt-card-t');
    k.innerHTML = `<p class="mt-card__t" id="mt-card-t">${esc(from ? T('{name} wants to go here with you', { name: from }) : T('A friend wants to go here with you'))}</p>
      <div class="mt-card__acts"><button type="button" class="pill-btn sm mt-card__yes" data-ivc="yes">${esc(T('Add to my Want to go'))}</button><button type="button" class="linkbtn" data-ivc="no">${esc(T('No thanks'))}</button></div>`;
    document.body.appendChild(k); requestAnimationFrame(() => k.classList.add('is-in'));
    const clean = () => { const u = new URL(location.href); u.searchParams.delete('invite'); u.searchParams.delete('from'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); };
    k.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ivc]'); if (!b) return; ev.preventDefault();
      if (b.dataset.ivc === 'yes') {
        const had = isFav(c, id);
        setEntry(c, id, { s: 'want', ...(had ? {} : { t: Date.now() }), ...(from ? { w: from } : {}) });
        if (!had) { const img = document.querySelector('.dhero img, #hero img'); keepOffline([location.href, img && img.currentSrc].filter(Boolean)); }
        toast(from ? T('Added to Want to go, with {name}', { name: from }) : T('Added to Want to go'));
      }
      clean(); k.classList.remove('is-in'); setTimeout(() => k.remove(), 250);
    });
  }

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
  if (document.readyState !== 'loading') { decorate(); inviteCard(); } else document.addEventListener('DOMContentLoaded', () => { decorate(); inviteCard(); });
  window.TGFeat = { isFav, favs, toggleFav, entry, setEntry, removeEntry, mtShows, mtTab: () => tab, locate, reminders, cancel, toast, native: NATIVE };
})();
