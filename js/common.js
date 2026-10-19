/* Shared helpers – Table and the City */
const TG = (() => {
  const BRAND = 'Table and the City';
  const LOCALE = 'en-GB';
  const TODAY = new Date().toISOString().slice(0, 10);
  const U = 'unknown';
  const TYPE_IMG = { 'fine dining': 'img/finedining.jpg', 'gastro-bistro': 'img/bistro.jpg', 'bistro': 'img/nieuw.jpg', 'brasserie': 'img/casual.jpg', 'casual': 'img/interior.jpg' };
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
  const isUpcoming = e => (e.dateEnd || e.dateStart) && (e.dateEnd || e.dateStart) >= TODAY;
  function badges(r, { withDist = true } = {}) {
    const b = [];
    if (r.isNew) b.push('<span class="badge solid">New</span>');
    if (r.vegan === 'yes') b.push('<span class="badge">Vegan</span>');
    if (r.vegetarian === 'yes') b.push('<span class="badge">Veggie</span>');
    if (r.events.some(isUpcoming)) b.push('<span class="badge solid">Event</span>');
    else if (r.events.length) b.push('<span class="badge">Collab</span>');
    if (withDist && r.distinctions.michelin && r.distinctions.michelin !== 'Michelin selection') b.push(`<span class="badge dist">${esc(stars(r.distinctions.michelin))}</span>`);
    if (withDist && r.distinctions.gaultMillau) b.push(`<span class="badge dist">G&amp;M ${r.distinctions.gaultMillau}</span>`);
    if (r.status !== 'open') b.push(`<span class="badge">${esc(r.status)}</span>`);
    return b.join('');
  }

  /* ---- cities ---- */
  let CITIES = null;
  async function cities() {
    if (!CITIES) CITIES = await fetch('data/cities.json').then(r => r.json());
    return CITIES;
  }
  function allCities(cfg) { return cfg.countries.flatMap(c => c.cities.map(x => ({ ...x, country: c.name, countryCode: c.code }))); }
  /* resolve ?city=…; unknown or inactive cities fall back to the default with a notice */
  async function currentCity() {
    const cfg = await cities(); const list = allCities(cfg);
    const asked = (new URLSearchParams(location.search).get('city') || cfg.defaultCity).toLowerCase();
    const hit = list.find(c => c.id === asked);
    const city = hit && hit.active ? hit : list.find(c => c.id === cfg.defaultCity);
    const notice = hit && hit.active ? '' : (hit ? `${hit.name} is coming soon — showing ${city.name}.` : `Unknown city “${asked}” — showing ${city.name}.`);
    return { cfg, city, notice };
  }
  const cityUrl = (page, cityId, extra = '') => `${page}?city=${encodeURIComponent(cityId)}${extra}`;
  function renderCitySel(cfg, city) {
    document.querySelectorAll('[data-citysel]').forEach(el => {
      el.innerHTML = `<button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose city">${esc(city.name)}, ${esc(city.country)}</button>
        <ul role="listbox">${cfg.countries.map(co => `<li class="grp">${esc(co.name)}</li>` + co.cities.map(c => c.active
          ? `<li role="option" aria-current="${c.id === city.id}"><a class="ci" href="${cityUrl('index.html', c.id)}">${esc(c.name)}<em>${c.id === city.id ? '●' : ''}</em></a></li>`
          : `<li role="option" aria-disabled="true"><span class="ci soon">${esc(c.name)}<em>soon</em></span></li>`).join('')).join('')}</ul>`;
      const btn = el.querySelector('button');
      btn.addEventListener('click', e => { e.stopPropagation(); const o = el.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
      document.addEventListener('click', () => { el.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
    });
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
    const rs = d.restaurants;
    const events = [];
    rs.forEach(r => r.events.forEach(e => events.push({ ...e, restaurantIds: [r.id], restaurantNames: [r.name] })));
    const merged = {};
    events.forEach(e => { const k = e.title + '|' + (e.dateStart || e.dateText);
      if (merged[k]) { merged[k].restaurantIds.push(...e.restaurantIds); merged[k].restaurantNames.push(...e.restaurantNames); } else merged[k] = { ...e }; });
    const allEvents = Object.values(merged).concat((d.extraEvents || []).map(e => ({ ...e, restaurantIds: [], restaurantNames: [] })));
    return { meta: d.city, restaurants: rs, events: allEvents, changelog: d.changelog || [] };
  }
  const haversine = (a, b) => { const R = 6371, t = x => x * Math.PI / 180; const dLat = t(b[0] - a[0]), dLng = t(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  function bindNav() {
    const nav = document.getElementById('nav'); if (!nav) return;
    document.querySelectorAll('[data-open-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.add('open'); nav.setAttribute('aria-hidden', 'false'); }));
    nav.querySelectorAll('[data-close-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.remove('open'); nav.setAttribute('aria-hidden', 'true'); }));
  }
  return { BRAND, LOCALE, TODAY, U, TYPE_IMG, TYPE_LABEL, esc, known, fmtDate, eur, priceNum, isStar, distRank, stars, isUpcoming, badges,
    cities, currentCity, cityUrl, renderCitySel, renderFooter, load, haversine, bindNav };
})();
