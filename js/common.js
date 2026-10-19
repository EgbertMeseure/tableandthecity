/* Shared helpers – Table and the City */
const TG = (() => {
  const BRAND = 'Table and the City';
  const LOCALE = 'en-GB';
  /* "today" in the guide's time zone (Europe/Brussels), computed once at page load */
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const U = 'unknown';
  const TYPE_KEY = { 'fine dining': 'finedining', 'gastro-bistro': 'bistro', 'bistro': 'nieuw', 'brasserie': 'casual', 'casual': 'interior' };
  const TYPE_IMG = Object.fromEntries(Object.entries(TYPE_KEY).map(([k, v]) => [k, `img/${v}.jpg`]));
  /* responsive <img> attributes for a site image key (img/<key>-{800,1600,2400}.webp, jpg fallback) */
  const imgAttrs = (key, sizes = '100vw') => `src="img/${key}.jpg" srcset="img/${key}-800.webp 800w, img/${key}-1600.webp 1600w, img/${key}-2400.webp 2400w" sizes="${sizes}"`;
  /* real, licensed photos of a restaurant only (Commons / own / Google Places when a key is configured) — never stock, never Instagram */
  function realPhotos(r) {
    const GKEY = (window.TG_CONFIG || {}).googleMapsKey || '';
    const g = GKEY ? (r.google_photos || []).map(p => {
      const a = (p.authorAttributions || [])[0] || {};
      const u = w => `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=${w}&key=${encodeURIComponent(GKEY)}`;
      return { src: u(1600), thumb: u(400), w: p.widthPx, h: p.heightPx, category: 'other', alt: `${r.name} — photo via Google Maps`, credit: a.displayName || 'Google Maps user', credit_url: a.uri, source: 'google_places', license: 'Google Maps' };
    }) : [];
    return [...(r.photos || []).filter(p => p.source !== 'stock' && p.source !== 'instagram_embed'), ...g];
  }
  const STOP = /^(de|het|le|la|les|l|the|by|and|&|'t|t|di|della|il|a|-|–)$/i;
  function initials(name) {
    const w = String(name).replace(/[.,]/g, '').split(/\s+/).filter(x => x && !STOP.test(x) && !/^[dl]['’]\p{L}{0,3}$/iu.test(x));
    const pick = w.length ? w : [String(name)];
    const first = s => (s.match(/[\p{L}\p{N}]/u) || [''])[0].toUpperCase();
    return pick.length === 2 && !/^\d/.test(pick[1]) ? first(pick[0]) + first(pick[1]) : first(pick[0]);   // two-word names → two initials
  }
  /* pill thumbnail: real photo if one exists, else a typographic monogram (dark grain, Didone initial, gold on hover) */
  function thumb(r, sizes = '80px') {
    const p = realPhotos(r).find(x => x.category === 'exterior' || x.category === 'interior') || realPhotos(r)[0];
    if (p) return `<img class="bw" src="${esc(p.thumb || p.src)}" ${p.srcset ? `srcset="${esc(p.srcset)}" sizes="${sizes}"` : ''} alt="" loading="lazy" decoding="async">`;
    const ini = initials(r.name);
    const tone = TYPE_KEY[r.type] || (r.group && r.group !== 'restaurants' ? r.group : 'interior');
    let h = 0; for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="mono-thumb grain mt-${tone}${ini.length > 1 ? ' two' : ''}" style="--ang:${h % 360}deg;--pos:${20 + h % 60}%" aria-hidden="true"><span>${esc(ini)}</span></span>`;
  }
  const GROUP_LABEL = { restaurants: 'Restaurants', cafes_bars: 'Cafés & bars', coffee: 'Coffee', bakeries: 'Bakeries' };
  const CAT_LABEL = { 'fine dining': 'Fine dining', 'gastro-bistro': 'Gastro-bistro', 'bistro': 'Bistro', 'brasserie': 'Brasserie', 'casual': 'Casual', restaurant: 'Restaurant',
    dance_cafe: 'Dance café', brown_cafe: 'Brown café', irish_pub: 'Irish pub', cafe: 'Café', coffee_bar: 'Specialty coffee', bakery: 'Bakery' };
  const catLabel = r => CAT_LABEL[r.category] || CAT_LABEL[r.type] || GROUP_LABEL[r.group] || '';
  const TYPE_LABEL = { 'fine dining': 'Fine dining', 'gastro-bistro': 'Gastro-bistro', 'bistro': 'Bistro', 'brasserie': 'Brasserie', 'casual': 'Casual' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const known = v => v != null && v !== '' && v !== U && !/^unknown\b/i.test(String(v));
  const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!iso || iso === U) return U;
    const parts = String(iso).split('-');
    if (parts.length === 1) return iso;
    if (parts.length === 2) return new Date(+parts[0], +parts[1] - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    return new Date(iso + 'T12:00:00').toLocaleDateString(LOCALE, opts);
  };
  const eur = n => '€' + (Number.isInteger(+n) ? n : (+n).toFixed(2));
  const priceNum = p => ({ '€': 1, '€€': 2, '€€€': 3, '€€€€': 4 }[p] || null);
  const isStar = m => /Michelin stars?$/.test(m || '');
  const distRank = r => {
    const m = r.distinctions.michelin; let s = 0;
    if (m === '2 Michelin stars') s = 300; else if (m === '1 Michelin star') s = 200; else if (m === 'Bib Gourmand') s = 120; else if (m === 'Michelin selection') s = 100;
    return s + (r.distinctions.gaultMillau || 0);
  };
  const stars = m => m === '2 Michelin stars' ? '★★' : m === '1 Michelin star' ? '★' : m === 'Bib Gourmand' ? 'Bib' : m === 'Michelin selection' ? 'Michelin' : '';
  /* next occurrence for rule-based events, e.g. {freq:'monthly', nth:2, weekday:6} = every 2nd Saturday */
  function nextOccurrence(rule, from = TODAY) {
    if (!rule || rule.freq !== 'monthly') return null;
    let [y, m] = from.split('-').map(Number);
    for (let i = 0; i < 14; i++) {
      const first = new Date(Date.UTC(y, m - 1, 1)); const off = (rule.weekday - first.getUTCDay() + 7) % 7;
      const d = new Date(Date.UTC(y, m - 1, 1 + off + 7 * (rule.nth - 1)));
      const iso = d.toISOString().slice(0, 10);
      if (d.getUTCMonth() === m - 1 && iso >= from) return iso;
      m++; if (m > 12) { m = 1; y++; }
    }
    return null;
  }
  /* normalise an event to its relevant (next) occurrence; returns null if it is in the past or undated */
  function liveEvent(e) {
    if (e.recurrence) { const n = nextOccurrence(e.recurrence); return n && (!e.recurrence.until || n <= e.recurrence.until) ? { ...e, dateStart: n, dateEnd: null } : null; }
    if (!e.dateStart) return e.ongoing && e.dateEnd && e.dateEnd >= TODAY ? e : null;
    return (e.dateEnd || e.dateStart) >= TODAY ? e : null;
  }
  const isUpcoming = e => !!liveEvent(e);
  /* priority order; cards pass {max: 2} */
  function badges(r, { withDist = true, max = 99 } = {}) {
    const b = [];
    if (r.status !== 'open') b.push(`<span class="badge">${esc(r.status)}</span>`);
    if (r.isNew) b.push('<span class="badge solid">New</span>');
    if (r.events.length) b.push('<span class="badge solid">Event</span>');
    if (r.vegan === 'yes') b.push('<span class="badge">Vegan</span>');
    else if (r.vegetarian === 'yes') b.push('<span class="badge">Veggie</span>');
    if (max > 2 && r.vegan === 'yes' && r.vegetarian === 'yes') b.push('<span class="badge">Veggie</span>');
    if (withDist && r.distinctions.michelin && r.distinctions.michelin !== 'Michelin selection') b.push(`<span class="badge dist">${esc(stars(r.distinctions.michelin))}</span>`);
    if (withDist && r.distinctions.gaultMillau) b.push(`<span class="badge dist">G&amp;M ${r.distinctions.gaultMillau}</span>`);
    return b.slice(0, max).join('');
  }

  /* ---- countries & cities ---- */
  let CITIES = null;
  async function cities() {
    if (!CITIES) CITIES = await fetch('data/cities.json').then(r => r.json());
    return CITIES;
  }
  function allCities(cfg) { return cfg.countries.flatMap(c => c.cities.map(x => ({ ...x, country: c.name, countryCode: c.code, countryId: c.id }))); }
  /* resolve ?country=…&city=…; unknown or inactive places fall back to the default with a notice */
  async function currentCity() {
    const cfg = await cities(); const list = allCities(cfg);
    const qs = new URLSearchParams(location.search);
    const askedCountry = (qs.get('country') || '').toLowerCase();
    const askedCity = (qs.get('city') || '').toLowerCase();
    const def = list.find(c => c.id === cfg.defaultCity);
    const co = cfg.countries.find(c => c.id === askedCountry);
    let city = def, notice = '';
    if (askedCountry && !co) notice = `Unknown country “${askedCountry}” — showing ${def.name}, ${def.country}.`;
    else if (co && !co.active) notice = `${co.name} is coming soon — showing ${def.name}, ${def.country}.`;
    else {
      const pool = co ? list.filter(c => c.countryId === co.id) : list;
      const hit = askedCity ? pool.find(c => c.id === askedCity) : pool.find(c => c.active);
      if (hit && hit.active) city = hit;
      else if (hit) notice = `${hit.name} is coming soon — showing ${def.name}.`;
      else if (askedCity) notice = `Unknown city “${askedCity}” — showing ${def.name}.`;
    }
    const country = cfg.countries.find(c => c.id === city.countryId);
    return { cfg, city, country, notice };
  }
  let CUR = null;
  const cityUrl = (page, cityId, extra = '') => {
    const c = CUR && CUR.id === cityId ? CUR : (CITIES ? allCities(CITIES).find(x => x.id === cityId) : null);
    return `${page}?country=${encodeURIComponent(c ? c.countryId : 'be')}&city=${encodeURIComponent(cityId)}${extra}`;
  };
  /* two pills: Country ▾  City ▾ (city list filtered by the chosen country) */
  function renderCitySel(cfg, city) {
    CUR = city;
    const cityItems = co => co.cities.map(c => c.active
      ? `<li role="option" aria-current="${c.id === city.id}"><a class="ci" href="${cityUrl('index.html', c.id)}">${esc(c.name)}<em>${c.id === city.id ? '●' : ''}</em></a></li>`
      : `<li role="option" aria-disabled="true"><span class="ci soon">${esc(c.name)}<em>soon</em></span></li>`).join('');
    document.querySelectorAll('[data-citysel]').forEach(el => {
      el.classList.add('placesel');
      el.innerHTML = `
        <div class="citysel" data-dd="country"><button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose country">${esc(city.country)}</button>
          <ul role="listbox">${cfg.countries.map(co => co.active
            ? `<li role="option" aria-current="${co.id === city.countryId}"><button type="button" class="ci" data-country="${esc(co.id)}">${esc(co.name)}<em>${co.id === city.countryId ? '●' : ''}</em></button></li>`
            : `<li role="option"><button type="button" class="ci soon" data-soon="${esc(co.name)}" aria-label="${esc(co.name)}, coming soon">${esc(co.name)}<em>soon</em></button></li>`).join('')}
            <li class="soon-msg" hidden></li></ul></div>
        <div class="citysel" data-dd="city"><button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose city">${esc(city.name)}</button>
          <ul role="listbox"><li class="grp">${esc(city.country)}</li>${cityItems(cfg.countries.find(c => c.id === city.countryId))}</ul></div>`;
      el.querySelectorAll('.citysel').forEach(dd => {
        const btn = dd.querySelector(':scope>button');
        btn.addEventListener('click', e => { e.stopPropagation(); el.querySelectorAll('.citysel').forEach(o => o !== dd && o.classList.remove('open'));
          const o = dd.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
        dd.querySelector('ul').addEventListener('click', e => e.stopPropagation());
      });
      el.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () => {
        const m = el.querySelector('.soon-msg'); m.hidden = false; m.textContent = `${b.dataset.soon} — coming soon`; }));
      el.querySelectorAll('[data-country]').forEach(b => b.addEventListener('click', () => {
        const co = cfg.countries.find(c => c.id === b.dataset.country);
        const ddc = el.querySelector('[data-dd="city"]'); el.querySelector('[data-dd="country"]').classList.remove('open');
        ddc.querySelector('ul').innerHTML = `<li class="grp">${esc(co.name)}</li>` + cityItems(co); ddc.classList.add('open');
      }));
    });
    document.addEventListener('click', () => document.querySelectorAll('.citysel.open').forEach(d => { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', 'false'); }));
    document.querySelectorAll('[data-home]').forEach(a => a.href = cityUrl('index.html', city.id) + (a.dataset.home || ''));
  }
  function renderFooter(cfg, city, extra = '') {
    const fam = cfg.brand.family.map(f => `<a href="https://${esc(f.domain)}" rel="noopener" title="${esc(f.domain)} – ${esc(f.status)}"><span class="wordmark"><span class="wm-main">${esc(f.name.split(' ')[0])}</span><span class="wm-sub">and the City</span></span></a> <span style="opacity:.6">(${esc(f.status)})</span>`).join(' · ');
    document.querySelectorAll('[data-footer]').forEach(el => el.innerHTML = `
      <a class="wordmark" href="${cityUrl('index.html', city.id)}"><span class="wm-main">Table</span><span class="wm-sub">and the City</span></a>
      <div class="family">Part of the <i style="font-family:var(--serif-it);text-transform:none;font-size:15px;letter-spacing:.02em">… and the City</i> family<br>${fam}</div>
      <a href="#top">Back to top ↑</a>
      <div class="meta"><span>${esc(cfg.brand.domain)} · prototype</span><span>${esc(city.name)}, ${esc(city.country)}</span><span>${extra || 'Data: Michelin · Gault&amp;Millau · own websites · press'}</span></div>`);
  }

  /* ---- data ---- */
  async function load(city) {
    const d = await fetch(city.data).then(r => r.json());
    const rs = d.restaurants.filter(r => r.status !== 'unverified');   // unverified records stay in the data, never shown
    /* only upcoming events exist for the UI: past / undated ones are dropped here, everywhere */
    rs.forEach(r => { r.events = (r.events || []).map(liveEvent).filter(Boolean); });
    const events = [];
    rs.forEach(r => r.events.forEach(e => events.push({ ...e, restaurantIds: [r.id], restaurantNames: [r.name] })));
    const merged = {};
    events.forEach(e => { const k = e.title + '|' + (e.dateStart || e.dateText);
      if (merged[k]) { merged[k].restaurantIds.push(...e.restaurantIds); merged[k].restaurantNames.push(...e.restaurantNames); } else merged[k] = { ...e }; });
    const allEvents = Object.values(merged).concat((d.extraEvents || []).map(liveEvent).filter(Boolean).map(e => ({ ...e, restaurantIds: [], restaurantNames: [] })))
      .sort((a, b) => a.dateStart.localeCompare(b.dateStart) || (a.dateEnd || a.dateStart).localeCompare(b.dateEnd || b.dateStart));
    return { meta: d.city, restaurants: rs, events: allEvents, changelog: d.changelog || [] };
  }
  const haversine = (a, b) => { const R = 6371, t = x => x * Math.PI / 180; const dLat = t(b[0] - a[0]), dLng = t(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  function bindNav() {
    const nav = document.getElementById('nav'); if (!nav) return;
    document.querySelectorAll('[data-open-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.add('open'); nav.setAttribute('aria-hidden', 'false'); }));
    nav.querySelectorAll('[data-close-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.remove('open'); nav.setAttribute('aria-hidden', 'true'); }));
  }
  /* ---- carousels: scroll-snap track + arrows + mouse drag with momentum (touch/trackpad scroll natively) ---- */
  const DRAG = new WeakMap();
  const wasDragged = el => { const d = DRAG.get(el); return !!(d && d.suppress); };
  function carousel(track) {
    if (!track || track._car) return; track._car = true;
    const id = track.id;
    const prev = document.querySelectorAll(`[data-car-prev="${id}"]`), next = document.querySelectorAll(`[data-car-next="${id}"]`);
    const step = () => Math.max(240, track.clientWidth * 0.8);
    const max = () => track.scrollWidth - track.clientWidth;
    function update() {
      const atStart = track.scrollLeft <= 2, atEnd = track.scrollLeft >= max() - 2, none = max() <= 2;
      prev.forEach(b => { b.disabled = atStart || none; b.setAttribute('aria-disabled', b.disabled); });
      next.forEach(b => { b.disabled = atEnd || none; b.setAttribute('aria-disabled', b.disabled); });
    }
    prev.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' })));
    next.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' })));
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    new ResizeObserver(update).observe(track);
    new MutationObserver(() => { track.scrollLeft = 0; update(); }).observe(track, { childList: true });
    track.addEventListener('keydown', e => {
      if (e.target !== track) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
    });
    /* vertical mouse wheel stays vertical page scroll; shift+wheel and trackpads scroll horizontally natively.
       Mouse drag: state is per gesture. A click is suppressed ONLY when the pointer of that same gesture moved
       > THRESH px between pointerdown and pointerup; every other path (arrows, wheel, touch, momentum) never
       blocks clicks. Pointer capture starts only after the threshold. Momentum never touches click state. */
    const THRESH = 6;
    const st = { id: null, down: false, moved: false, x0: 0, sl: 0, v: 0, t: 0, lx: 0, raf: 0, suppress: false };
    DRAG.set(track, st);
    const stopGlide = () => { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; track.classList.remove('dragging'); };
    const reset = () => {
      if (st.id != null) { try { if (track.hasPointerCapture(st.id)) track.releasePointerCapture(st.id); } catch (_) {} }
      st.id = null; st.down = false; st.moved = false;
    };
    track.addEventListener('pointerdown', e => {
      stopGlide(); reset(); st.suppress = false;                       // fresh gesture, nothing carried over
      if (e.pointerType !== 'mouse' || e.button !== 0) return;          // touch & pen use native swipe
      Object.assign(st, { id: e.pointerId, down: true, x0: e.clientX, sl: track.scrollLeft, v: 0, t: performance.now(), lx: e.clientX });
    });
    track.addEventListener('pointermove', e => {
      if (!st.down || e.pointerId !== st.id) return;
      if (!(e.buttons & 1)) { reset(); return; }                         // button released outside the window
      const dx = e.clientX - st.x0;
      if (!st.moved) {
        if (Math.abs(dx) <= THRESH) return;
        st.moved = true; track.classList.add('dragging');
        try { track.setPointerCapture(e.pointerId); } catch (_) {}
      }
      const now = performance.now(), dt = Math.max(1, now - st.t);
      st.v = 0.8 * st.v + 0.2 * ((st.lx - e.clientX) / dt); st.t = now; st.lx = e.clientX;
      track.scrollLeft = st.sl - dx; e.preventDefault();
    });
    track.addEventListener('pointerup', e => {
      if (e.pointerId !== st.id) return;
      const dragged = st.down && st.moved && Math.abs(e.clientX - st.x0) > THRESH;
      const v0 = st.v * 16; reset();
      st.suppress = dragged;                                             // only the click of THIS gesture
      if (dragged) setTimeout(() => { st.suppress = false; }, 0);        // click fires synchronously after pointerup
      if (!dragged) { track.classList.remove('dragging'); return; }
      let v = v0;
      const glide = () => {
        const before = track.scrollLeft;
        if (Math.abs(v) < 0.5) { stopGlide(); return; }
        track.scrollLeft += v; v *= 0.94;
        if (track.scrollLeft === before) { stopGlide(); return; }       // hit an edge
        st.raf = requestAnimationFrame(glide);
      };
      st.raf = requestAnimationFrame(glide);
    });
    const cancel = e => { if (e.pointerId === st.id) { reset(); stopGlide(); st.suppress = false; } };
    track.addEventListener('pointercancel', cancel);
    track.addEventListener('lostpointercapture', e => { if (e.pointerId === st.id && st.down) { reset(); stopGlide(); } });
    window.addEventListener('blur', () => { reset(); stopGlide(); });
    track.addEventListener('click', e => { if (st.suppress) { st.suppress = false; e.preventDefault(); e.stopPropagation(); } }, true);
    track.addEventListener('dragstart', e => e.preventDefault());
    update();
  }
  return { GROUP_LABEL, CAT_LABEL, catLabel, realPhotos, initials, thumb, carousel, wasDragged, BRAND, LOCALE, TODAY, U, TYPE_IMG, TYPE_KEY, imgAttrs, liveEvent, nextOccurrence, TYPE_LABEL, esc, known, fmtDate, eur, priceNum, isStar, distRank, stars, isUpcoming, badges,
    cities, currentCity, cityUrl, renderCitySel, renderFooter, load, haversine, bindNav };
})();
