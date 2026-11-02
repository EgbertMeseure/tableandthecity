/* Table and the City – "Promote your place" (promote.html) and its thank-you page (promote-thanks.html). PREVIEW: not linked from the site, noindex.
   - Packages, prices, capacities and Stripe Payment Links: js/promote-config.js (window.TG_PROMOTE).
   - Sold spots: data/promote-bookings.json (one object per sale, see PROMOTE.md); a month that is full shows "Fully booked" and can't be picked.
     (?bookings=example loads data/promote-bookings.example.json, demo data for previewing the calendar.)
   - The buyer picks a city, their own place (searchable list of this city's places, from the same data the guide uses: TG.load), a package and a month
     (and for Top of the list a position 1–5 in the place's own list = its group: restaurants / cafés & bars / coffee / bakeries).
   - Buy = the package's Stripe Payment Link + ?client_reference_id=<city>__<package id>__<YYYY-MM>__<place id>&locale=<ui language>
     (URL-safe [A-Za-z0-9_-], ≤ 200 characters: the place id is trimmed when needed). Empty stripeUrl → a disabled "Coming soon".
   Copy is English here and translated by js/i18n.js (keys in scripts/i18n_strings.txt); prices and month names are formatted per language. */
(async function () {
  const { esc, cityUrl } = TG;
  const I = window.TG_I18N || { lang: 'en' }, t = (k, v) => I.t ? I.t(k, v) : k.replace(/\{(\w+)\}/g, (m, x) => v && v[x] != null ? v[x] : m);
  TG.bindNav();
  const { cfg, city: first, notice } = await TG.currentCity();
  let city = first;
  const $ = s => document.querySelector(s);
  const head = c => {
    TG.renderCitySel(cfg, c, document.body.dataset.page === 'promote' ? 'promote.html' : 'guide.html'); TG.renderFooter(cfg, c);
    const b = $('#back'); if (b) b.href = cityUrl('guide.html', c.id);
    const e = $('#ih-city'); if (e) e.textContent = c.name;
  };
  head(city);
  if (notice && $('#city-notice')) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }
  document.body.classList.add('is-ready');
  const P = window.TG_PROMOTE; if (!P || !$('#pm-cities')) return;          // the thank-you page stops here

  const all = cfg.countries.flatMap(co => co.cities.map(x => ({ ...x, country: co.name, countryCode: co.code, countryId: co.id })));
  const cities = (P.cities || []).map(id => all.find(c => c.id === id && c.active)).filter(Boolean);
  if (!cities.some(c => c.id === city.id) && cities.length) city = cities[0];
  const LOC = { en: 'en-IE', nl: 'nl-BE', fr: 'fr-BE', de: 'de-BE', es: 'es-ES' }[I.lang] || 'en-IE';
  const eur = n => new Intl.NumberFormat(LOC, { style: 'currency', currency: P.currency || 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  const inc = n => Math.round(n * (1 + (P.vatRate || 0.21)) * 100) / 100;
  const vatPct = Math.round((P.vatRate || 0.21) * 100);
  const PK = Object.fromEntries(P.packages.map(p => [p.id, p]));

  /* ---- months shown: the current month (Europe/Brussels) and the next ones ---- */
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const MONTHS = []; { let [y, m] = now.split('-').map(Number); for (let i = 0; i < (P.months || 6); i++) { MONTHS.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } }
  const mLabel = (ym, long) => new Intl.DateTimeFormat(LOC, { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-15T12:00:00Z')).replace('.', '');

  /* ---- bookings → availability ---- */
  let BK = [];
  const bkUrl = new URLSearchParams(location.search).get('bookings') === 'example' ? 'data/promote-bookings.example.json' : (P.bookings || 'data/promote-bookings.json');
  try { BK = ((await fetch(TG.bust(bkUrl), { cache: 'no-cache' }).then(r => r.ok ? r.json() : {})).bookings || []).filter(b => b && b.package && /^\d{4}-\d{2}$/.test(b.start || '')); } catch (e) { BK = []; }
  const active = (b, m) => b.start <= m && (b.end === null ? true : m <= (b.end || (PK[b.package] && PK[b.package].recurring ? '9999-12' : b.start)));
  const uses = (b, id) => b.package === id || ((PK[b.package] || {}).includes || []).includes(id);   // a bundle uses up its parts
  const usedCount = (id, m, c, list) => BK.filter(b => uses(b, id) && active(b, m) && (c == null || b.city === c) && (list == null || (b.list || 'restaurants') === list)).length;
  const cap = id => id.startsWith('top-list-') ? 1 : ((PK[id] || {}).capacity || 1);
  const scopeCity = id => (PK[id] || {}).section === 'instagram' ? null : city.id;            // Instagram = one account for all cities
  const scopeList = id => id.startsWith('top-list-') ? curList() : null;
  const free = (id, m) => cap(id) - usedCount(id, m, scopeCity(id), scopeList(id));
  const okMonth = (p, m) => (p.includes || [p.id]).every(id => free(id, m) > 0);

  /* ---- the buyer's place (from the guide's own data for this city) ---- */
  let PLACES = [], place = null, placesFor = '';
  const LISTS = { restaurants: 'Restaurants', cafes_bars: 'Cafés & bars', coffee: 'Coffee', bakeries: 'Bakeries' };
  const curList = () => (place && place.group && LISTS[place.group]) ? place.group : 'restaurants';
  async function loadPlaces() {
    const id = city.id; placesFor = id; PLACES = [];
    try { const d = await TG.load(city); if (placesFor !== id) return;
      PLACES = d.restaurants.filter(r => r.name && r.status !== 'closed').map(r => ({ id: r.id, name: r.name, group: r.group, type: TG.catLabel ? TG.catLabel(r) : (r.category || ''), area: r.neighbourhood || r.district || '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nl')); } catch (e) { PLACES = []; }
    const inp = $('#pm-place-q'); if (inp) { inp.disabled = false; inp.placeholder = t('Search your place in {city}', { city: t(city.name) }); }
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /* ---- what each card lists (English keys, translated by js/i18n.js) and the small schematic previews ---- */
  const GETS = {
    'top-list': ['In the top five of its category list, in the city you pick', 'Marked Promoted, with your photo and details', 'Five spots per list, cheaper further down; subject to availability'],
    'city-page': ['A Featured row of three places at the top of the city page', 'Your photo, name and type, linked to your page in the guide', 'Three spots per city, subject to availability; when they are full, you start as soon as one frees up'],
    'ig-story': ['One story, live for 24 hours', 'A link sticker to your website or booking page', 'Your handle tagged'],
    'ig-shared': ['Your place in a carousel with three to five good places', 'Your photo, one line about you and your handle tagged', 'Stays on our profile'],
    'ig-own': ['Up to ten photos of your place in one carousel', 'A short text in our own voice, facts checked with you', 'A collab invite, so it can show on your profile too'],
    'bundle': ['Top of the list, position 1', 'Top of the city page', 'Your own Instagram post every month', 'One Instagram story every month']
  };
  const row = (on, tag) => `<span class="pmv-row${on ? ' is-on' : ''}"><i></i><b></b>${tag ? '<em>Promoted</em>' : ''}</span>`;
  const VIS = {
    'top-list': pos => `<div class="pmv pmv--list"><span class="pmv-bar"></span>${[1, 2, 3, 4, 5].map(n => row(n === pos, n === pos)).join('')}</div>`,
    'city-page': () => `<div class="pmv pmv--city"><span class="pmv-hero"></span><span class="pmv-feat"><i class="is-on"></i><i></i><i></i></span>${row()}${row()}</div>`,
    'ig-story': () => `<div class="pmv pmv--ig"><span class="pmv-story"><span class="pmv-prog"></span><span class="pmv-stick"></span></span></div>`,
    'ig-shared': () => `<div class="pmv pmv--ig"><span class="pmv-post pmv-post--grid"><i class="is-on"></i><i></i><i></i><i></i></span></div>`,
    'ig-own': () => `<div class="pmv pmv--ig"><span class="pmv-post pmv-post--own"><span class="pmv-dots"><i class="is-on"></i><i></i><i></i></span></span></div>`,
    'bundle': () => `<div class="pmv pmv--bundle"><span class="pmv-story"><span class="pmv-prog"></span><span class="pmv-stick"></span></span><span class="pmv-post pmv-post--own"><span class="pmv-dots"><i class="is-on"></i><i></i><i></i></span></span><span class="pmv-mini">${row(1, 1)}${row()}${row()}</span></div>`
  };
  const groups = [];
  P.packages.forEach(p => { let g = groups.find(x => x.id === p.group); if (!g) groups.push(g = { id: p.group, section: p.section, items: [] }); g.items.push(p); });
  const sel = {};                                                          // group → { id: package id, m: month }
  const firstFree = g => { for (const m of MONTHS) for (const p of g.items) if (okMonth(p, m)) return { id: p.id, m }; return { id: g.items[0].id, m: MONTHS[0] }; };
  const fix = g => { const s = sel[g.id]; if (!s || !okMonth(PK[s.id], s.m)) sel[g.id] = firstFree(g); return sel[g.id]; };

  /* ---- Stripe link: client_reference_id = city__package__month__place (URL-safe, ≤ 200) ---- */
  const safe = s => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const ref = (p, m) => { const base = `${safe(city.id)}__${safe(p.id)}__${m}__`; return base + safe(place ? place.id : 'none').slice(0, 200 - base.length); };
  const buyHref = (p, m) => {
    try { const u = new URL(p.stripeUrl); u.searchParams.set('client_reference_id', ref(p, m)); if (I.lang) u.searchParams.set('locale', I.lang); return u.href; }
    catch (e) { return ''; }
  };
  /* until when a monthly spot stays free after the chosen start month (a later booking ends it) */
  const until = (p, m) => { if (!p.recurring) return ''; const later = MONTHS.filter(x => x > m); const stop = later.find(x => !okMonth(p, x));
    if (!stop) return ''; const i = MONTHS.indexOf(stop); return MONTHS[i - 1]; };

  /* ---- calendars ---- */
  const grid = g => {                                                      // Top of the list: months × positions 1–5
    const s = fix(g);
    return `<div class="pm-cal" role="group" aria-label="Position in the list">
      <p class="pm-cal__list">${esc(t('Free spots in the {x} list', { x: t(LISTS[curList()]) }))}</p>
      <table class="pm-grid"><thead><tr><td></td>${g.items.map(p => `<th scope="col">${esc(p.chip)}<small>${esc(eur(p.price))}</small></th>`).join('')}</tr></thead>
      <tbody>${MONTHS.map(m => `<tr><th scope="row">${esc(mLabel(m))}</th>${g.items.map(p => { const ok = okMonth(p, m), on = s.id === p.id && s.m === m;
        return `<td><button type="button" class="pm-cell${ok ? '' : ' is-full'}" data-pick="${esc(p.id)}" data-m="${m}" aria-pressed="${on}"${ok ? '' : ' disabled'}
          aria-label="${esc(`${p.chip} · ${mLabel(m, true)} · ${t(ok ? 'Free' : 'Fully booked')}`)}">${ok ? (on ? '&#10003;' : '') : '<span>Full</span>'}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table>
      <p class="pm-legend"><span class="pm-key"></span>Free <span class="pm-key is-on"></span>Your pick <span class="pm-key is-full"></span>Fully booked</p></div>`;
  };
  const months = g => {                                                    // other packages: one row of month buttons with the free count
    const s = fix(g), p = PK[s.id], capN = Math.min(...(p.includes || [p.id]).map(id => cap(id)));
    return `<div class="pm-months" role="group" aria-label="${p.recurring ? 'Start month' : 'Month'}">${MONTHS.map(m => {
      const ok = okMonth(p, m), n = Math.min(...(p.includes || [p.id]).map(id => free(id, m)));
      const st = !ok ? t('Fully booked') : (p.includes || capN <= 1) ? t('Free') : t('{n} of {c} free', { n, c: capN });
      return `<button type="button" class="pm-month${ok ? '' : ' is-full'}" data-pick="${esc(p.id)}" data-m="${m}" aria-pressed="${s.m === m}"${ok ? '' : ' disabled'}><b>${esc(mLabel(m))}</b><span>${esc(st)}</span></button>`; }).join('')}</div>`;
  };

  const card = g => {
    const s = fix(g), p = PK[s.id], m = s.m, ok = okMonth(p, m);
    const has = P.live === true && /^https:\/\//.test(p.stripeUrl || ''), href = has && place && ok ? buyHref(p, m) : '';
    const worth = p.worth ? `<span class="pm-price__worth">${esc(t('Separately {a}, you save {b}', { a: eur(p.worth), b: eur(p.worth - p.price) }))}</span>` : '';
    const u = until(p, m);
    const sum = `<div class="pm-sum">
        <p class="pm-sum__place">${place ? `<b data-i18n-skip>${esc(place.name)}</b>` : `<i>No place chosen yet</i>`}<span>${esc(t(city.name))}</span></p>
        <p class="pm-sum__what">${esc([p.chip ? t('Position {n}', { n: p.position }) : '', (u === m ? t('Only {date} for now, the month after is booked', { date: mLabel(m, true) }) : p.recurring ? t('From {date}', { date: mLabel(m, true) }) : mLabel(m, true)), u && u !== m ? t('until {date}', { date: mLabel(u, true) }) : ''].filter(Boolean).join(' · '))}</p>
      </div>`;
    /* online payment is not open yet: every card shows a disabled "Coming soon" until TG_PROMOTE.live is set to true (and stripeUrl is filled) */
    const btn = (P.live !== true || !has) ? `<button type="button" class="pm-buy is-soon" disabled aria-disabled="true">Coming soon</button>`
      : !ok ? `<button type="button" class="pm-buy is-soon" disabled>Fully booked</button>`
      : !place ? `<button type="button" class="pm-buy is-soon" data-need-place>Choose your place first</button>`
      : `<a class="pm-buy" href="${esc(href)}" rel="noopener">${p.recurring ? 'Subscribe' : 'Buy now'}</a>`;
    return `<div class="pm-card__vis" aria-hidden="true">${VIS[g.id](p.position)}</div>
      <div class="pm-card__body">
        <h3 class="pm-card__name">${esc(p.name)}</h3>
        <p class="pm-card__desc">${esc(p.description)}</p>
        <ul class="pm-gets">${(GETS[g.id] || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="pm-card__foot">
          <p class="pm-dur1">${esc(p.duration)}</p>
          ${g.id === 'top-list' ? grid(g) : months(g)}
          <p class="pm-price"><span class="pm-price__ex">${esc(eur(p.price))}</span>${p.recurring === 'month' ? '<span class="pm-price__per">per month</span>' : ''}<span class="pm-price__tax">excl. VAT</span>${worth}
            <span class="pm-price__inc">${esc(t(p.recurring === 'month' ? '{p} per month incl. {v}% VAT' : '{p} incl. {v}% VAT', { p: eur(inc(p.price)), v: vatPct }))}</span></p>
          ${sum}
          ${btn}
        </div>
      </div>`;
  };
  const renderCards = () => document.querySelectorAll('.pmgrid[data-section]').forEach(gr => {
    gr.innerHTML = groups.filter(g => g.section === gr.dataset.section).map(g => `<article class="pm-card pm-card--${esc(g.id)}" data-group="${esc(g.id)}">${card(g)}</article>`).join('');
  });
  const renderPlace = () => {
    const box = $('#pm-place');
    box.innerHTML = place
      ? `<div class="pm-picked"><span class="pm-picked__name" data-i18n-skip>${esc(place.name)}</span><span class="pm-picked__meta">${esc([place.type, place.area].filter(Boolean).join(' · ') || (place.id === 'new' ? t('Not in the guide yet: tell us in the notes at checkout') : ''))}</span>
         <button type="button" class="pm-picked__change" data-change-place>Change</button></div>`
      : `<div class="pm-combo"><input id="pm-place-q" type="search" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="pm-place-list" aria-autocomplete="list"
           aria-label="Your place" placeholder="${esc(PLACES.length ? t('Search your place in {city}', { city: t(city.name) }) : t('Loading places…'))}"${PLACES.length ? '' : ' disabled'}>
         <ul id="pm-place-list" role="listbox" hidden></ul></div>`;
    if (!place) bindCombo();
  };
  function bindCombo() {
    const inp = $('#pm-place-q'), ul = $('#pm-place-list'); let hits = [], act = -1;
    const show = () => {
      const q = norm(inp.value.trim());
      hits = q ? PLACES.filter(r => norm(r.name).includes(q)).sort((a, b) => (norm(a.name).startsWith(q) ? 0 : 1) - (norm(b.name).startsWith(q) ? 0 : 1)).slice(0, 8) : [];
      const opts = hits.map((r, i) => `<li role="option" id="pm-opt-${i}" data-i="${i}" aria-selected="${i === act}"><b data-i18n-skip>${esc(r.name)}</b><span>${esc([r.type, r.area].filter(Boolean).join(' · '))}</span></li>`);
      if (q) opts.push(`<li role="option" id="pm-opt-${hits.length}" data-i="new" aria-selected="${act === hits.length}" class="pm-opt-new"><b>My place is not in the guide yet</b><span>We check it first and add it for free when it fits</span></li>`);
      ul.innerHTML = opts.join(''); ul.hidden = !q; inp.setAttribute('aria-expanded', String(!!q));
      if (act >= 0) inp.setAttribute('aria-activedescendant', 'pm-opt-' + act); else inp.removeAttribute('aria-activedescendant');
    };
    const choose = i => {
      place = i === 'new' ? { id: 'new', name: inp.value.trim() || t('New place'), group: 'restaurants', type: '', area: '' } : hits[+i];
      if (!place) return; renderPlace(); renderCards(); const c = $('[data-change-place]'); if (c) c.focus();
    };
    inp.addEventListener('input', () => { act = -1; show(); });
    inp.addEventListener('keydown', e => {
      const n = hits.length + (inp.value.trim() ? 1 : 0); if (!n) return;
      if (e.key === 'ArrowDown') { act = (act + 1) % n; show(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { act = (act - 1 + n) % n; show(); e.preventDefault(); }
      else if (e.key === 'Enter' && act >= 0) { choose(act === hits.length ? 'new' : act); e.preventDefault(); }
      else if (e.key === 'Escape') { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
    });
    ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(li.dataset.i); } });
    document.addEventListener('click', e => { if (!e.target.closest('.pm-combo')) { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); } });
  }
  const renderCities = () => {
    $('#pm-cities').innerHTML = cities.map(c => `<button type="button" class="pm-chip" data-city="${esc(c.id)}" aria-pressed="${c.id === city.id}">${esc(c.name)}</button>`).join('');
    $('#pm-guide-lede').textContent = t('Placements on the website and in the app, per month, in {city}.', { city: t(city.name) });
  };
  const render = () => { renderCities(); renderPlace(); renderCards(); document.title = t('Promote your place · {city} — Table and the City', { city: t(city.name) }); };
  render();
  loadPlaces().then(() => { if (!place) renderPlace(); });
  document.addEventListener('click', e => {
    const d = e.target.closest('[data-pick]');
    if (d && !d.disabled) { const art = d.closest('.pm-card'), g = groups.find(x => x.id === art.dataset.group); sel[g.id] = { id: d.dataset.pick, m: d.dataset.m || sel[g.id].m };
      art.innerHTML = card(g); const again = art.querySelector(`[data-pick="${d.dataset.pick}"][data-m="${sel[g.id].m}"]`); if (again) again.focus(); return; }
    if (e.target.closest('[data-change-place]')) { place = null; renderPlace(); renderCards(); const i = $('#pm-place-q'); if (i) i.focus(); return; }
    if (e.target.closest('[data-need-place]')) { const i = $('#pm-place-q'); if (i) { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); i.focus({ preventScroll: true }); } return; }
    const c = e.target.closest('[data-city]');
    if (c && c.closest('#pm-cities') && c.dataset.city !== city.id) {
      city = cities.find(x => x.id === c.dataset.city) || city; place = null;
      const u = new URL(location.href); u.searchParams.set('country', city.countryId); u.searchParams.set('city', city.id); history.replaceState(null, '', u);
      head(city); render(); loadPlaces().then(() => { if (!place) renderPlace(); });
      const again = $(`#pm-cities [data-city="${city.id}"]`); if (again) again.focus();
    }
  });
})();
