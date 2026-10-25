/* Table and the City – city overview page */
(async function () {
  const { esc, fmtDate, eur, known, priceNum, distRank, isStar, isUpcoming, badges, TYPE_IMG, TYPE_LABEL, GROUP_LABEL, CAT_LABEL, catLabel, haversine, cityUrl } = TG;
  TG.bindNav();
  const { cfg, city, notice } = await TG.currentCity();
  TG.renderCitySel(cfg, city); TG.renderFooter(cfg, city);
  const { restaurants: R, events: E, changelog } = await TG.load(city);
  const CITY = city.name;
  document.title = `Table and the City — ${CITY}: restaurants, cafés, coffee & bakeries`;
  const $ = s => document.querySelector(s);
  const ADV = ['group', 'type', 'area', 'cuisine', 'price', 'dist'];          // set by the category cards (and shareable URLs); no filter panel
  const QUICK = ['open', 'new', 'veggie', 'vegan', 'events'];                  // on/off filters kept in the URL (chips: open, new, events)
  const DEF = { q: '', group: '', type: '', area: '', cuisine: '', price: '', dist: '', veggie: false, vegan: false, new: false, events: false, open: false, stage: '', vlevel: '', meal: '', style: '', sort: 'rec', ev: '' };
  const state = { ...DEF, origin: null, originLabel: '' };

  // ---- URL state (shareable; ?country=&city= always kept) ----
  const params = new URLSearchParams(location.search);
  ['q', ...ADV, 'sort', 'ev', 'stage', 'vlevel', 'meal', 'style'].forEach(k => params.get(k) && (state[k] = params.get(k)));
  if (!['', 'vegan', 'vegetarian', 'vegan-friendly', 'veggie-friendly'].includes(state.vlevel)) state.vlevel = '';
  // diet filters (veggie / vegan / vlevel) have no chips any more: set by the cards' Veggie/Vegan rows, the quiz or old links; shown in the list title, cleared by Reset
  if (!['', 'open', 'soon'].includes(state.stage)) state.stage = '';
  if (!['', 'any', 'breakfast', 'brunch', 'wkbrunch', 'early'].includes(state.meal)) state.meal = '';
  if (!/^[a-z-]{0,20}$/.test(state.style)) state.style = '';
  if (state.stage) state.new = true;                                   // stage = sub-filter of "New": just opened | opening soon
  QUICK.forEach(k => params.get(k) === '1' && (state[k] = true));
  ['area', 'price'].forEach(k => state[k] = ''); if (!TG.CZ_BY[state.cuisine]) state.cuisine = '';   // cuisine = a TG.CUISINES id (By cuisine card, quiz) if (state.dist !== 'michelin') state.dist = '';   // filter panel removed: only what the cards can set
  if (state.sort !== 'dist') state.sort = 'rec';                         // no sort menu: recommended order, or distance once Near me / a map point is set
  function syncUrl() {
    const p = new URLSearchParams(); p.set('country', city.countryId); p.set('city', city.id);
    ['q', ...ADV, 'stage', 'vlevel', 'meal', 'style', 'ev'].forEach(k => state[k] && p.set(k, state[k]));
    if (state.sort !== 'rec') p.set('sort', state.sort);
    QUICK.forEach(k => state[k] && p.set(k, '1'));
    history.replaceState(null, '', location.pathname + '?' + p + location.hash);
  }
  const advCount = () => ADV.filter(k => state[k]).length;
  const anyActive = () => !!(state.q || advCount() || QUICK.some(k => state[k]) || state.stage || state.vlevel || state.meal || state.style || state.origin || state.sort !== 'rec');
  /* announced-but-not-open places only appear under New (all new / opening soon), never in the plain lists */
  const isNewish = r => r.isNew || r.upcoming;
  const OPEN = R.filter(r => !r.upcoming);

  // ---- hero labels ----
  $('#lbl-count').textContent = `${OPEN.length} places in ${CITY}`;
  const nLv = l => OPEN.filter(r => r.veggieLevel === l).length;
  $('#lbl-veg').textContent = `${nLv('vegan')} fully vegan · ${nLv('vegetarian')} vegetarian · ${OPEN.filter(r => r.veggieLevel).length} with veggie options`;
  $('#lbl-ev').textContent = `${E.filter(isUpcoming).length} upcoming events & collaborations`;
  $('#explore-title').textContent = `All places in ${CITY}`; $('#about-city').textContent = CITY;
  if (notice) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }

  // ---- breakfast & brunch: confirmed (sourced) values; 'early' = opens ≤ 10:00 by sourced hours, no breakfast claim ----
  const MEAL = (r, v) => { const m = TG.mealOf(r); return v === 'any' ? m.any : v === 'breakfast' ? m.bf : v === 'brunch' ? m.br : v === 'wkbrunch' ? m.wk : v === 'early' ? m.early : true; };
  // card photo: the og:image a confirmed breakfast/brunch place publishes itself (hotlinked, credited); else the site's own coffee image
  function mealPhoto() {   // reviewed heroes only (not the research preview layer)
    const r = R.filter(x => TG.mealOf(x).any && x.heroImage && !x.heroImage.origin).sort((a, b) => (b.curated ? 1 : 0) - (a.curated ? 1 : 0) || a.name.localeCompare(b.name))[0];
    if (!r) return null;
    const dom = r.heroImage.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return { url: r.heroImage.url, credit: `Photo: ${dom} (${r.name})`, href: r.heroImage.source };
  }
  // ---- "Choose your table": top-level group cards, each with a small sub-menu ----
  const sub = (label, f) => ({ label, f });
  const CZL = TG.cuisineList(R);                                          // cuisines with >= 3 restaurants (js/common.js)
  const GROUPS = [
    { label: 'New', img: 'plated', f: { new: true }, subs: [sub('Just opened', { new: true, stage: 'open' }), sub('Opening soon', { new: true, stage: 'soon' }),
      ...Object.keys(GROUP_LABEL).map(g => sub(GROUP_LABEL[g], { new: true, group: g }))] },
    { label: 'Breakfast & Brunch', img: 'coffee', photo: mealPhoto(), f: { meal: 'any' }, subs: [sub('Breakfast', { meal: 'breakfast' }), sub('Brunch', { meal: 'brunch' }),
      sub('Weekend brunch', { meal: 'wkbrunch' }), sub('Opens early', { meal: 'early' })], allMin: 0 },
    { label: 'Restaurants', img: 'finedining', f: { group: 'restaurants' }, subs: [
      sub('Fine dining', { group: 'restaurants', type: 'fine dining' }), sub('Gastro-bistro', { group: 'restaurants', type: 'gastro-bistro' }),
      sub('Bistro', { group: 'restaurants', type: 'bistro' }), sub('Brasserie', { group: 'restaurants', type: 'brasserie' }),
      sub('Casual', { group: 'restaurants', type: 'casual' }), sub('Michelin', { group: 'restaurants', dist: 'michelin' })] },
    { label: 'Cafés & bars', img: 'bar', f: { group: 'cafes_bars' }, subs: [
      sub('Dance cafés', { group: 'cafes_bars', type: 'dance_cafe' }), sub('Brown cafés', { group: 'cafes_bars', type: 'brown_cafe' }),
      sub('Irish pubs', { group: 'cafes_bars', type: 'irish_pub' }), { ...sub('Cocktail bars', { group: 'cafes_bars', type: 'cocktail_bar' }), min: 1 },
      { ...sub('Wine bars', { group: 'cafes_bars', type: 'wine_bar' }), min: 1 }] },   // generic cafés are not imported; beer bars under 'All'
    { label: 'Coffee', img: 'coffee', f: { group: 'coffee' }, subs: [sub('Specialty coffee', { group: 'coffee', type: 'coffee_bar' }),
      sub('Shops & roasters', { group: 'coffee', type: 'coffee_shop' })] },
    { label: 'Bakeries', img: 'bakery', f: { group: 'bakeries' }, subs: [sub('Bakeries', { group: 'bakeries', type: 'bakery' }),   // artisan only (see import_osm.py / data/bakeries-artisan.json)
      sub('Patisseries', { group: 'bakeries', type: 'patisserie' }), sub('Sourdough', { group: 'bakeries', style: 'sourdough' })] },
    // 'By cuisine': one card, its cuisines open in a compact chooser (openCz) instead of an in-card menu
    { label: 'By cuisine', img: 'casual', f: { group: 'restaurants' }, subs: [], chooser: true },
    // no separate 'Veggie & vegan' card: every card has its own Veggie / Vegan row (+ the quick chips)
    { label: 'Events', img: 'events', f: { events: true }, subs: [], toEvents: true }
  ];
  const matchF = (r, f) => (!r.upcoming || f.new) && Object.entries(f).every(([k, v]) =>
    k === 'group' ? r.group === v : k === 'type' ? v.split('+').includes(r.category) : k === 'new' ? isNewish(r) : k === 'stage' ? (v === 'soon') === !!r.upcoming :
    k === 'meal' ? MEAL(r, v) : k === 'veggie' ? !!r.veggieLevel : k === 'vegan' ? r.vegan === 'yes' : k === 'vlevel' ? r.veggieLevel === v : k === 'style' ? (r.bakeryStyle || []).includes(v) : k === 'events' ? r.events.length > 0 : k === 'dist' ? !!r.distinctions.michelin : k === 'cuisine' ? TG.inCuisine(r, v) : true);
  const countF = f => R.filter(r => matchF(r, f)).length;
  GROUPS.forEach(g => { g.n = g.toEvents ? E.filter(isUpcoming).length : countF(g.f); g.subs = g.subs.map(s => ({ ...s, n: countF(s.f) })).filter(s => s.n >= (s.min || 3)); });   // tiny sub-groups stay reachable via filters
  /* diet row in every place card's menu: 'Veggie' (any veggie level, = the Veggie chip) / 'Vegan' (fully vegan or clear vegan options, = the Vegan chip).
     A toggle narrows 'All' and the sub-categories (live counts; empty ones hide); only shown when the card has matching places */
  const DIET = { veggie: { label: 'Veggie', f: { veggie: true }, title: 'Fully vegan or vegetarian, or clear veggie/vegan options' }, vegan: { label: 'Vegan', f: { vegan: true }, title: 'Fully vegan or clear vegan options' } };
  GROUPS.forEach(g => { g.diets = g.toEvents || g.noDiet || !g.subs.length ? [] : Object.keys(DIET).filter(d => (g['n_' + d] = countF({ ...g.f, ...DIET[d].f })) > 0);
    g.subs.forEach(s => g.diets.forEach(d => { s['n_' + d] = countF({ ...s.f, ...DIET[d].f }); })); });
  // each card is a stadium-shaped tile; its sub-menu lives INSIDE the card (revealed from the bottom, clipped by the card's radius)
  $('#carousel').innerHTML = GROUPS.map((c, i) => `
    <div class="pillcard bw-host grain${c.subs.length ? ' has-menu' : ''}" data-cat="${i}">
      <img class="bw" ${TG.imgAttrs(c.img, '(max-width: 900px) 45vw, 240px')} alt="" loading="lazy">${c.photo ? `<img class="bw pill-photo" src="${esc(c.photo.url)}" referrerpolicy="no-referrer" alt="" loading="lazy" decoding="async" onerror="this.nextElementSibling&&this.nextElementSibling.classList.contains('pill-credit')&&this.nextElementSibling.remove();this.remove()"><a class="pill-credit" href="${esc(c.photo.href)}" target="_blank" rel="noopener">${esc(c.photo.credit)}</a>` : ''}${c.subs.length ? '<i class="pill-shade" aria-hidden="true"></i>' : ''}
      <button class="pill-main" data-cat="${i}" aria-label="${esc(c.label)}, ${c.chooser ? `${CZL.length} cuisines` : `${c.n} ${c.toEvents ? 'upcoming' : 'places'}`}"${c.chooser ? ' aria-haspopup="dialog"' : ''}${c.subs.length ? ` aria-haspopup="menu" aria-expanded="false" aria-controls="pm-${i}"` : ''}>
        <span class="pill-label">${esc(c.label)}<small>${c.chooser ? `${CZL.length} cuisines` : `${c.n} ${c.toEvents ? 'upcoming' : 'places'}`}</small></span></button>
      ${c.subs.length ? `<div class="pillmenu${c.subs.length > 7 ? ' many' : ''}${c.diets.length ? ' has-diet' : ''}" id="pm-${i}" role="menu" aria-label="${esc(c.label)}">${c.diets.length ? `<div class="pm-diet" role="group" aria-label="Diet">${c.diets.map(d => `<button role="menuitemcheckbox" aria-checked="false" tabindex="-1" data-d="${d}" title="${esc(DIET[d].title)}">${DIET[d].label}<b>${c['n_' + d]}</b></button>`).join('')}</div>` : ''}
        <button role="menuitem" tabindex="-1" class="pm-all" data-s="-1" aria-label="All ${esc(c.label.toLowerCase())}, ${c.n}">All<b>${c.n}</b></button><i class="pm-br" aria-hidden="true"></i>
        ${c.subs.map((s, j) => `<button role="menuitem" tabindex="-1" data-s="${j}">${esc(s.label)}<b>${s.n}</b></button>`).join('')}</div>` : ''}
    </div>`).join('');
  function setDiet(card, d) {                                            // '' = off; updates counts in the open menu
    const g = GROUPS[+card.dataset.cat]; card.dataset.diet = d;
    card.querySelectorAll('[data-d]').forEach(b => b.setAttribute('aria-checked', b.dataset.d === d));
    card.querySelectorAll('[data-s]').forEach(b => { const j = +b.dataset.s, s = j < 0 ? g : g.subs[j], n = d ? s['n_' + d] : s.n;
      b.querySelector('b').textContent = n; b.hidden = j >= 0 && !n; });
  }
  function choose(g, f, card) {
    resetFilters(false); Object.assign(state, f); closeMenu(false);
    document.querySelectorAll('.pillcard').forEach(p => p.classList.toggle('active', p === card));
    applyUI(); render();
    document.getElementById(g.toEvents ? 'events' : 'explore').scrollIntoView();
  }
  let menuFor = null, tOpen, tClose, lastPtr = 'mouse';
  const hoverable = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mainOf = card => card.querySelector('.pill-main');
  const itemsOf = card => [...card.querySelectorAll('.pillmenu [data-s], .pillmenu [data-d]')].filter(b => !b.hidden);
  function openMenu(card, { focus = false } = {}) {
    clearTimeout(tClose); if (!card.classList.contains('has-menu')) return;
    if (menuFor !== card) { closeMenu(false); menuFor = card; card.classList.add('menu-open'); mainOf(card).setAttribute('aria-expanded', 'true'); }
    if (focus) itemsOf(card)[0].focus();
  }
  function closeMenu(refocus) {
    clearTimeout(tOpen); clearTimeout(tClose); if (!menuFor) return;
    const card = menuFor; menuFor = null; card.classList.remove('menu-open'); mainOf(card).setAttribute('aria-expanded', 'false'); if (card.dataset.diet) setDiet(card, '');
    if (refocus) mainOf(card).focus();
  }
  const car = $('#carousel');
  car.addEventListener('pointerdown', e => { lastPtr = e.pointerType || 'mouse'; }, true);
  car.addEventListener('pointerover', e => {
    const c = e.target.closest('.pillcard'); if (!c || e.pointerType !== 'mouse' || !hoverable() || car.classList.contains('dragging') || e.buttons) return;
    clearTimeout(tClose); if (menuFor === c) return; clearTimeout(tOpen); tOpen = setTimeout(() => openMenu(c), menuFor ? 0 : 140);
  });
  car.addEventListener('pointerout', e => {
    const c = e.target.closest('.pillcard'); if (!c || e.pointerType !== 'mouse' || (e.relatedTarget && c.contains(e.relatedTarget))) return;
    clearTimeout(tOpen); tClose = setTimeout(() => closeMenu(false), 220);
  });
  car.addEventListener('pointermove', e => { if (e.buttons & 1 && menuFor && car.classList.contains('dragging')) closeMenu(false); });
  addEventListener('resize', () => closeMenu(false));
  car.addEventListener('click', e => {
    if (TG.wasDragged(car)) return;
    const c = e.target.closest('.pillcard'); if (!c) return;
    const g = GROUPS[+c.dataset.cat], it = e.target.closest('[data-s]'), dt = e.target.closest('[data-d]');
    if (dt) { if (menuFor !== c) { openMenu(c); return; } setDiet(c, c.dataset.diet === dt.dataset.d ? '' : dt.dataset.d); return; }
    if (it) { if (menuFor !== c) { openMenu(c); return; } const j = +it.dataset.s, d = c.dataset.diet; choose(g, { ...(j < 0 ? g.f : g.subs[j].f), ...(d ? DIET[d].f : {}) }, c); return; }
    if (g.chooser) { closeMenu(false); openCz(g, c); return; }
    // touch / no-hover devices: first tap opens the in-card menu (its first item selects the whole group)
    if (g.subs.length && (lastPtr !== 'mouse' || !hoverable()) && e.detail !== 0) { if (menuFor === c) closeMenu(false); else openMenu(c); return; }
    choose(g, g.f, c);
  });
  car.addEventListener('keydown', e => {
    const c = e.target.closest('.pillcard'); if (!c) return;
    const items = itemsOf(c), i = items.indexOf(document.activeElement);
    if (i < 0) {                                                          // focus on the card itself
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); openMenu(c, { focus: true }); }
      else if (e.key === 'Escape') closeMenu(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) closeMenu(true); else items[i - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(true);
  });
  document.addEventListener('pointerdown', e => { if (menuFor && !menuFor.contains(e.target)) closeMenu(false); });
  TG.carousel($('#carousel'));
  /* 'By cuisine' chooser: a small sheet (same shell as 'Request your city') with the cuisines + the usual Veggie / Vegan toggle */
  let czRoot = null, czCard = null, czLast = null;
  function czDraw(d) {
    const f = d ? DIET[d].f : {}, all = countF({ group: 'restaurants', ...f });
    czRoot.querySelectorAll('[data-czd]').forEach(b => b.setAttribute('aria-pressed', b.dataset.czd === d));
    czRoot.querySelector('.czs__grid').innerHTML = `<button class="czs__c czs__c--all" type="button" data-cz="">All restaurants<b>${all}</b></button>` +
      CZL.map(c => ({ c, n: countF({ group: 'restaurants', cuisine: c.id, ...f }) })).filter(x => x.n).map(({ c, n }) =>
        `<button class="czs__c" type="button" data-cz="${esc(c.id)}">${esc(c.label)}<b>${n}</b></button>`).join('');
    czRoot.dataset.diet = d;
  }
  function openCz(g, card) {
    czCard = card; czLast = document.activeElement;
    if (!czRoot) {
      czRoot = document.createElement('div'); czRoot.className = 'crq czs'; czRoot.hidden = true;
      czRoot.innerHTML = `<div class="crq__scrim" data-czs-close></div>
        <div class="crq__sheet czs__sheet" role="dialog" aria-modal="true" aria-labelledby="czs-title">
          <button class="crq__x" type="button" data-czs-close aria-label="Close">Close</button>
          <p class="crq__eyebrow">Choose your table</p><h2 class="crq__t" id="czs-title">By cuisine</h2>
          <p class="crq__lead">Restaurants in ${esc(CITY)}, by kitchen.</p>
          <div class="czs__diet" role="group" aria-label="Diet">${Object.keys(DIET).map(d => `<button class="chip" type="button" data-czd="${d}" aria-pressed="false" title="${esc(DIET[d].title)}">${DIET[d].label}</button>`).join('')}</div>
          <div class="czs__grid"></div>
        </div>`;
      document.body.appendChild(czRoot);
      czRoot.addEventListener('click', e => {
        if (e.target.closest('[data-czs-close]')) return closeCz();
        const dd = e.target.closest('[data-czd]'); if (dd) return czDraw(czRoot.dataset.diet === dd.dataset.czd ? '' : dd.dataset.czd);
        const b = e.target.closest('[data-cz]'); if (!b) return;
        const d = czRoot.dataset.diet; closeCz(false);
        choose(g, { group: 'restaurants', ...(b.dataset.cz ? { cuisine: b.dataset.cz } : {}), ...(d ? DIET[d].f : {}) }, czCard);
      });
      czRoot.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeCz(); } });
    }
    czDraw('');
    czRoot.hidden = false; document.documentElement.classList.add('crq-lock');
    requestAnimationFrame(() => czRoot.classList.add('is-open'));
    setTimeout(() => czRoot.querySelector('.czs__c').focus({ preventScroll: true }), 30);
  }
  function closeCz(refocus = true) {
    if (!czRoot || czRoot.hidden) return;
    czRoot.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    setTimeout(() => { czRoot.hidden = true; }, 200);
    if (refocus && czLast && czLast.focus) czLast.focus({ preventScroll: true });
  }

  // ---- search ----
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  R.forEach(r => r._hay = norm([r.name, r.type, catLabel(r), GROUP_LABEL[r.group], r.cuisine, r.cuisineTags.join(' '), r.chef, r.neighbourhood, r.district, r.address, r.menuType, r.menuChanges, r.currentMenuNote, r.dietNote, r.summary,
    r.distinctions.michelin, r.events.map(e => [e.title, e.type, (e.partners || []).join(' ')].join(' ')).join(' '), r.isNew ? 'new nieuw' : '', r.upcoming ? 'opening soon upcoming binnenkort' : '', r.vegan === 'yes' ? 'vegan plant-based plantaardig' : '', r.vegetarian === 'yes' ? 'veggie vegetarian vegetarisch' : '', r.veggieLevel ? TG.VEG_LABEL[r.veggieLevel] : '', r.original_nl ? Object.values(r.original_nl).join(' ') : ''].join(' ')));
  E.forEach(e => e._hay = norm([e.title, e.type, e.location, (e.partners || []).join(' '), e.restaurantNames.join(' '), e.note].join(' ')));
  const terms = () => norm(state.q).split(/\s+/).filter(Boolean);

  function filtered() {
    const t = terms(), now0 = new Date();
    let list = R.filter(r => {
      if (state.open && TG.openState(r, now0).state !== 'open') return false;   // "Open now" pill (js/hours.js, Europe/Brussels)
      if (t.length && !t.every(w => r._hay.includes(w))) return false;
      if (state.group && r.group !== state.group) return false;
      if (state.type && !state.type.split('+').includes(r.category)) return false;
      if (state.area) { const [k, v] = [state.area.slice(0, 1), state.area.slice(2)]; if (k === 'd' ? r.district !== v : r.neighbourhood !== v) return false; }
      if (state.cuisine && !TG.inCuisine(r, state.cuisine)) return false;
      if (state.price && r.priceLevel !== state.price) return false;
      const d = r.distinctions;
      if (state.dist === 'star' && !isStar(d.michelin)) return false;
      if (state.dist === 'bib' && d.michelin !== 'Bib Gourmand') return false;
      if (state.dist === 'michelin' && !d.michelin) return false;
      if (state.dist === 'gm15' && !(d.gaultMillau >= 15)) return false;
      if (state.dist === 'gm13' && !(d.gaultMillau >= 13)) return false;
      if (state.dist === 'gm' && !d.gaultMillau) return false;
      if (state.veggie && !r.veggieLevel) return false;
      if (state.vegan && r.vegan !== 'yes') return false;
      if (state.vlevel && r.veggieLevel !== state.vlevel) return false;
      if (state.meal && !MEAL(r, state.meal)) return false;
      if (state.style && !(r.bakeryStyle || []).includes(state.style)) return false;
      if (r.upcoming && !state.new) return false;
      if (state.new && !isNewish(r)) return false;
      if (state.stage && (state.stage === 'soon') !== !!r.upcoming) return false;
      if (state.events && !r.events.length) return false;
      return true;
    });
    if (state.origin) list.forEach(r => r._km = r.lat ? haversine(state.origin, [r.lat, r.lng]) : null);
    const nm = (a, b) => a.name.localeCompare(b.name, 'en');
    const VR = r => ({ vegan: 4, vegetarian: 3, 'vegan-friendly': 2, 'veggie-friendly': 1 }[r.veggieLevel] || 0);
    const opened = r => r.opened || '0';
    const exp = r => /^\d{4}/.test(r.expectedOpening || '') ? r.expectedOpening : '0000';    // 'soon' sorts first among upcoming
    const soonFirst = (a, b) => (!!a.upcoming - !!b.upcoming) || (a.upcoming && b.upcoming ? exp(a).localeCompare(exp(b)) : 0);
    const by = {
      // curated (hand-researched) places first, then the OpenStreetMap base list; veggie level breaks ties when filtering on it
      rec: (a, b) => soonFirst(a, b) || (!!b.curated - !!a.curated) || distRank(b) - distRank(a) || (b.isNew - a.isNew)
        || ((state.veggie || state.vegan) ? VR(b) - VR(a) : 0) || nm(a, b),
      price: (a, b) => (priceNum(a.priceLevel) ?? 9) - (priceNum(b.priceLevel) ?? 9) || (a.priceFrom ?? 999) - (b.priceFrom ?? 999) || nm(a, b),
      new: (a, b) => soonFirst(a, b) || opened(b).localeCompare(opened(a)) || nm(a, b),
      dist: (a, b) => (a._km ?? 1e9) - (b._km ?? 1e9)
    };
    // open now first, then unknown hours, then closed (Europe/Brussels); the chosen ranking stays the order within each group
    const now = new Date(); list.forEach(r => { r._oh = TG.openState(r, now); });
    const base = state.sort === 'dist' && !state.origin ? by.rec : (by[state.sort] || by.rec);
    list._base = base;
    return list.sort((a, b) => TG.OPEN_RANK[a._oh.state] - TG.OPEN_RANK[b._oh.state] || base(a, b));
  }
  /* re-evaluate "open now" every minute: labels update in place; the re-sort waits until the list is out of view (or the tab
     was hidden) so nothing moves under the reader, and keeps the number of cards shown and the scroll position */
  let ohPending = false;
  const ohKey = o => o.state + '|' + (o.opensAt ? o.opensAt.dayOffset + o.opensAt.time : '') + (o.byStatus ? 's' : '');
  function ohTick(force) {
    const now = new Date(); let changed = false;
    LIST.forEach(r => { const o = TG.openState(r, now); if (!r._oh || ohKey(o) !== ohKey(r._oh)) { if (!r._oh || o.state !== r._oh.state) changed = true; r._oh = o; } });
    document.querySelectorAll('#list .card[data-id] [data-oh]').forEach(el => { const r = BYID.get(el.closest('.card').dataset.id); if (!r) return;
      const h = TG.openLabel(r._oh); if (el.innerHTML !== h) el.innerHTML = h; });
    if (changed) ohPending = true;
    if (!ohPending) return;
    const box = $('#list').getBoundingClientRect(), inView = box.bottom > 0 && box.top < innerHeight;
    if (inView && !force && !document.hidden) return;
    ohPending = false;
    const y = scrollY, n = shown;
    if (state.open) { render(); scrollTo(0, y); return; }                // "Open now" is on: places that closed/opened leave/join the list
    LIST.sort((a, b) => TG.OPEN_RANK[a._oh.state] - TG.OPEN_RANK[b._oh.state] || LIST._base(a, b));
    $('#list').innerHTML = LIST.slice(0, n).map(card).join(''); moreBtn(); TG.lazyIg($('#list'));
    scrollTo(0, y);
  }
  const BYID = new Map(R.map(r => [r.id, r]));
  setTimeout(() => { ohTick(); setInterval(ohTick, 60000); }, 60000 - Date.now() % 60000 + 500);   // just after each minute
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ohTick(true); });

  // ---- map (greyscale) ----
  const map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView(city.center, city.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  // clustered markers (vendored Leaflet.markercluster): ~1,500 places stay fast; clusters split from zoom 17
  const layer = (L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 44, disableClusteringAtZoom: 17, chunkedLoading: true, spiderfyOnMaxZoom: false,
    iconCreateFunction: c => { const n = c.getChildCount(); return L.divIcon({ className: '', html: `<div class="mkc${n > 99 ? ' big' : n > 19 ? ' mid' : ''}"><span>${n}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }); } })
    : L.layerGroup()).addTo(map);
  let originMarker = null;
  map.on('click', e => setOrigin([e.latlng.lat, e.latlng.lng], 'chosen point'));
  function setOrigin(ll, label) {
    state.origin = ll; state.originLabel = label; state.sort = 'dist';
    if (originMarker) originMarker.remove();
    originMarker = L.circleMarker(ll, { radius: 8, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map).bindTooltip(label === 'my location' ? 'My location' : 'Starting point');
    $('#maphint').textContent = `Distance from ${label}`; applyUI(); render();
  }
  function clearOrigin() { state.origin = null; if (originMarker) originMarker.remove(); originMarker = null; $('#maphint').textContent = 'Click the map to sort by distance'; }
  function locate() {
    if (!navigator.geolocation) { $('#maphint').textContent = 'Location unavailable — click the map instead'; return; }
    $('#btn-loc').textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(p => { $('#btn-loc').textContent = 'Near me'; setOrigin([p.coords.latitude, p.coords.longitude], 'my location'); map.setView([p.coords.latitude, p.coords.longitude], 13); },
      () => { $('#btn-loc').textContent = 'Near me'; $('#maphint').textContent = 'Location unavailable — click the map instead'; applyUI(); }, { timeout: 8000 });
  }
  $('#btn-loc').addEventListener('click', () => { if (state.origin) { clearOrigin(); if (state.sort === 'dist') state.sort = 'rec'; applyUI(); render(); } else locate(); });

  // ---- render list + markers ----
  const detailUrl = id => cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(id));
  const SHORT = { glutenFree: 'Gluten-free', naPairing: 'NA pairing', wheelchair: 'Wheelchair', vegan: 'Vegan', aLaCarte: 'À la carte', gaultMillau: 'G&M', chefCollabs: 'Chef collabs', openSunday: 'Sunday', openMonday: 'Monday', foodServed: 'Food', reservations: 'Bookable' };
  /* booking button on list cards (only categories in TG_CONFIG.BOOKING_BUTTON_TYPES): online link → "Check availability ↗";
     no online link but a phone (data says phone-only, or nothing researched yet) → tel: "Reservation by phone"; walk-in only → chip */
  const BK_TYPES = (window.TG_CONFIG || {}).BOOKING_BUTTON_TYPES || [];
  const bookOn = r => r.group === 'restaurants' && !r.upcoming && !r.fromUpcoming && (BK_TYPES.includes('*') || BK_TYPES.includes(r.category));
  const bookMethod = r => r.reservationMethod === 'walk-in' ? 'walk-in' : r.reservation_url ? 'online' : known(r.phone) && r.phone ? 'phone' : 'none';
  function booking(r) {
    const m = bookMethod(r);
    if (m === 'online') return `<span class="bk bk--online" data-href="${esc(r.reservation_url)}" role="link" tabindex="0" title="Book online${r.reservation_provider ? ' via ' + esc(r.reservation_provider) : ''} (opens in a new tab)" aria-label="Check availability at ${esc(r.name)} (opens booking page in a new tab)">Check availability <i aria-hidden="true">↗</i></span>`;
    if (m === 'phone') { const tel = String(r.phone).replace(/[^\d+]/g, '');
      return `<span class="bk bk--phone" data-tel="tel:${esc(tel)}" role="link" tabindex="0" title="Call ${esc(r.phone)} to reserve" aria-label="Reservation by phone: call ${esc(r.name)} at ${esc(r.phone)}"><span class="bk__l">Reservation by phone</span><span class="bk__n" aria-hidden="true">${esc(r.phone)}</span></span>`; }
    if (m === 'walk-in') return `<span class="bk-chip" title="${esc(r.reservationNote || 'No reservations: walk-in only')}">Walk-in only</span>`;
    return '';
  }
  function card(r) {
    const price = known(r.priceLevel) ? r.priceLevel : (r.priceFrom ? `from ${eur(r.priceFrom)}` : '');
    const isR = r.group === 'restaurants', cu = (r.cuisine || '').split(/[,–(]/)[0].trim();
    const meta = [catLabel(r), isR && cu !== catLabel(r) ? cu : '', known(r.neighbourhood) ? r.neighbourhood : '', price].filter(Boolean).map(esc).join(' · ');
    const km = state.origin && r._km != null ? `<span>${r._km.toFixed(1)} km</span>` : '';
    // "At a glance" chips: only sourced-true features (same group-specific set as the detail grid); New/Event already are badges
    const ft = TG.featureTiles(r), MAXF = 4;
    const on = ft.TILES.filter(([k]) => ft.F[k] === true && k !== 'new' && k !== 'events' && !(r.veggieLevel && (k === 'veggie' || k === 'vegan')));   // level is the badge
    const chips = on.slice(0, MAXF).map(([k, l]) => `<li class="fchip" title="${esc(ft.EV[k] ? `${l} — ${ft.EV[k]}` : l)}">${esc(SHORT[k] || l)}</li>`).join('')
      + (on.length > MAXF ? `<li class="fchip more" title="${esc(on.slice(MAXF).map(([k, l]) => SHORT[k] || l).join(', '))}">+${on.length - MAXF}</li>` : '');
    return `<a class="card bw-host" href="${detailUrl(r.id)}" data-id="${esc(r.id)}">
      <div class="card__thumb">${TG.thumb(r, '80px')}</div>
      <div class="card__body"><div class="badges"><span class="ohs" data-oh>${TG.openLabel(r._oh)}</span>${badges(r, { max: 2 })}</div><h3>${esc(r.name)}${TG.scoreBadge(r)}</h3><div class="card__meta" title="${meta}">${meta}</div>
      ${chips ? `<ul class="fchips" aria-label="Confirmed features">${chips}</ul>` : ''}
      <div class="card__foot">${km}${bookOn(r) ? booking(r) : isR && r.reservation_url && !r.fromUpcoming ? `<span class="ext resv" data-href="${esc(r.reservation_url)}" role="link" tabindex="0" aria-label="Reserve at ${esc(r.name)} (opens booking page)">Reserve ↗</span>` : ''}${r.website ? `<span class="ext" data-href="${esc(r.website)}" role="link" tabindex="0">Website ↗</span>` : ''}${r.upcoming ? '<span>Announced</span>' : ''}</div></div></a>`;
  }
  /* list title follows the chosen table: 'Vegan breakfast in Gent', 'New veggie coffee in Gent', … (other filters keep it) */
  const MEAL_T = { any: 'breakfast & brunch', breakfast: 'breakfast', brunch: 'brunch', wkbrunch: 'weekend brunch', early: 'early openers' };
  function listTitle() {
    const diet = state.vlevel ? TG.VEG_LABEL[state.vlevel] : state.vegan ? 'Vegan' : state.veggie ? 'Veggie' : '';
    const cz = TG.CZ_BY[state.cuisine], noun = cz ? cz.title || cz.label + ' restaurants' : state.type && CAT_LABEL[state.type] ? CAT_LABEL[state.type] : state.meal ? MEAL_T[state.meal] : state.group ? GROUP_LABEL[state.group] : state.dist === 'michelin' ? 'Michelin' : '';
    const nw = state.new ? (state.stage === 'soon' ? 'Opening soon:' : state.stage === 'open' ? 'Just opened:' : 'New') : '';
    if (!diet && !noun && !nw) return `All places in ${CITY}`;
    const w = [nw, diet, noun || (diet || nw ? 'places' : '')].filter(Boolean);
    return w.map((x, i) => i ? (/^[A-Z][a-z]/.test(x) && !/^Michelin/.test(x) && !(cz && x === noun) ? x.toLowerCase() : x) : x[0].toUpperCase() + x.slice(1)).join(' ') + ` in ${CITY}`;
  }
  function render() {
    syncUrl(); $('#explore-title').textContent = listTitle();
    const list = filtered();
    $('#count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;
    $('#reset').hidden = !anyActive();
    // list: first PAGE cards, "Show more" appends the next PAGE (keeps the DOM small with ~1,500 places)
    LIST = list; shown = Math.min(PAGE, list.length);
    $('#list').innerHTML = list.length ? list.slice(0, shown).map(card).join('') : '<div class="empty">Nothing matches these filters. <button class="linkbtn" data-reset>Reset</button></div>';
    moreBtn(); TG.lazyIg($('#list'));
    layer.clearLayers();
    layer.addLayers ? layer.addLayers(list.filter(r => r.lat).map(marker)) : list.filter(r => r.lat).forEach(r => marker(r).addTo(layer));
    renderEvents();
  }
  const PAGE = 24; let LIST = [], shown = 0;
  function moreBtn() {
    const left = LIST.length - shown, b = $('#list-more');
    b.hidden = left <= 0; b.textContent = `Show more (${Math.min(PAGE, left)} of ${left} more)`;
    // "Missing a place? Suggest it" (js/suggest.js) as the last line of the list itself (desktop: the list scrolls inside its column;
    // phone: the copy under "Show more" in .list-more is used instead, see css)
    let sl = $('#list .suggest-line--in');
    if (!sl) { sl = document.createElement('p'); sl.className = 'suggest-line suggest-line--in'; sl.innerHTML = 'Missing a place? <a href="#suggest" data-suggest>Suggest it</a>'; }
    $('#list').appendChild(sl);
  }
  $('#list-more').addEventListener('click', () => {
    const next = LIST.slice(shown, shown + PAGE); shown += next.length;
    $('#list').insertAdjacentHTML('beforeend', next.map(card).join('')); moreBtn(); TG.lazyIg($('#list'));
  });
  function marker(r) {                                                     // built once per place, reused across renders
    if (r._m) return r._m;
    const m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: `<div class="mk g-${esc(r.group)}${isStar(r.distinctions.michelin) ? ' star' : ''}${r.upcoming ? ' soon' : ''}${r.curated ? '' : ' osm'}" data-mk="${esc(r.id)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
      .bindPopup(() => `<b>${esc(r.name)}</b>${TG.scoreBadge(r)}${TG.openState(r).state === 'open' ? ' <span class="oh oh--open oh--pop">Open now</span>' : ''}${r.upcoming ? `<br><i>${esc(TG.soonLabel(r))}</i>` : ''}${r.veggieLevel ? `<br><i>${esc(TG.VEG_LABEL[r.veggieLevel])}</i>` : ''}<br>${esc([catLabel(r), r.group === 'restaurants' && r.cuisine && r.cuisine !== catLabel(r) ? r.cuisine.split(/[,–(]/)[0] : ''].filter(Boolean).join(' · '))}${known(r.address) ? '<br>' + esc(r.address) : ''}<br><a href="${detailUrl(r.id)}">Details →</a> · <a href="${esc(TG.directionsUrl(r))}" target="_blank" rel="noopener">Directions ↗</a>`);
    m.on('mouseover', () => hl(r.id, true)); m.on('mouseout', () => hl(r.id, false));
    return (r._m = m);
  }
  function hl(id, on) {
    document.querySelectorAll(`[data-mk="${CSS.escape(id)}"]`).forEach(x => x.classList.toggle('hl', on));
    const c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (c) c.classList.toggle('is-hover', on);
  }
  $('#list').addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, true); });
  $('#list').addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, false); });
  $('#list').addEventListener('click', e => {
    if (e.target.closest('[data-reset]')) { e.preventDefault(); resetFilters(); return; }
    const b = e.target.closest('.bk'); if (b) { e.preventDefault(); if (b.dataset.tel) location.href = b.dataset.tel; else window.open(b.dataset.href, '_blank', 'noopener'); return; }
    const x = e.target.closest('.ext'); if (x) { e.preventDefault(); window.open(x.dataset.href, '_blank', 'noopener'); }
  });
  $('#list').addEventListener('keydown', e => { const b = e.target.closest('.bk'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.click(); } });

  // ---- events (upcoming only; past/undated are dropped in TG.load) ----
  const EVGROUPS = [
    { id: 'popup', label: 'Pop-ups', re: /pop-up/i },
    { id: 'collab', label: 'Chef collabs', re: /four-hands|guest chef|takeover|collaboration|chef collective/i },
    { id: 'dinner', label: 'Dinners', re: /themed|wine dinner|charity|menu/i },
    { id: 'festival', label: 'Festivals', re: /festival|culinary event/i },
    { id: 'night', label: 'Concerts & club nights', re: /concert|club night|dj set|party/i }
  ];
  const evGroup = e => (EVGROUPS.find(g => g.re.test(e.type)) || {}).id;
  E.forEach(e => e._g = evGroup(e));
  const groups = EVGROUPS.filter(g => E.some(e => e._g === g.id));
  if (state.ev && !groups.some(g => g.id === state.ev)) state.ev = '';
  $('#ev-chips').innerHTML = E.length ? [{ id: '', label: 'All' }, ...groups].map(g => `<button class="chip" data-ev="${g.id}" aria-pressed="${state.ev === g.id}">${esc(g.label)}</button>`).join('') : '';
  $('#ev-chips').addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (!b) return; state.ev = b.dataset.ev;
    $('#ev-chips').querySelectorAll('[data-ev]').forEach(x => x.setAttribute('aria-pressed', x === b)); syncUrl(); renderEvents(); });
  function renderEvents() {
    const t = terms();
    const ev = E.filter(e => (!state.ev || e._g === state.ev) && (!t.length || t.every(w => e._hay.includes(w))));
    $('#ev-count').textContent = E.length ? `${ev.length} upcoming` : '';
    if (!E.length) { $('#evlist').innerHTML = `<div class="ev-empty"><span class="ev-empty__mark">—</span><p>No upcoming events or collaborations in ${esc(CITY)} right now.</p><p class="sub">New dates are added daily — check back soon.</p></div>`; return; }
    $('#evlist').innerHTML = ev.length ? ev.map(e => {
      const date = fmtDate(e.dateStart, { day: 'numeric', month: 'short' }) + (e.dateEnd && e.dateEnd !== e.dateStart ? ' <span class="dash">–</span> ' + fmtDate(e.dateEnd, { day: 'numeric', month: 'short' }) : '') + ' ' + (e.dateEnd || e.dateStart).slice(0, 4);
      const links = e.restaurantIds.map((id, i) => `<a href="${detailUrl(id)}">${esc(e.restaurantNames[i])}</a>`).join('');
      // hierarchy: small date/type line → event NAME (dominant, max 3 lines) → venue small
      return `<article class="ev"><div class="ev__when"><span class="ev__date">${date}</span><span class="ev__type">${esc(e.type)}${e.recurrence && !/recurring/i.test(e.type) ? ' · recurring' : ''}</span></div>
        <h3 class="ev__title" title="${esc(e.title)}">${esc(e.title)}</h3><div class="ev__meta ev__venue">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
        ${e.note ? `<div class="ev__note">${esc(e.note)}</div>` : ''}
        <div class="ev__links">${links}${(e.sources || []).slice(0, 2).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">Source${e.sources.length > 1 ? ' ' + (i + 1) : ''} ↗</a>`).join('')}</div></article>`;
    }).join('') : '<div class="ev-empty"><p>No upcoming events match.</p><p class="sub">Try “All” or clear the search.</p></div>';
  }

  // ---- changelog ----
  $('#changelog').innerHTML = changelog.slice().reverse().slice(0, 8).map(c => `<li><strong>${esc(fmtDate(c.date))}</strong> — ${esc(c.restaurant)}: ${esc(c.change)}</li>`).join('');

  // ---- UI binding ----
  function applyUI() {
    $('#q').value = state.q; $('#q-hero').value = state.q;
    document.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-pressed', state[b.dataset.toggle]));
    document.querySelectorAll('[data-vl]').forEach(b => b.setAttribute('aria-pressed', state.vlevel === b.dataset.vl));
    $('#btn-loc').setAttribute('aria-pressed', !!state.origin);
  }
  function resetFilters(rerender = true) {
    Object.assign(state, { ...DEF, ev: state.ev }); clearOrigin();
    document.querySelectorAll('.pillcard').forEach(p => p.classList.remove('active'));
    if (rerender) { applyUI(); render(); }
  }
  let tmr; const onQ = v => { state.q = v; clearTimeout(tmr); tmr = setTimeout(() => { applyUI(); render(); }, 60); };
  $('#q').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('explore').scrollIntoView(); });
  document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.toggle; state[k] = !state[k]; if (k === 'new' && !state.new) state.stage = ''; b.setAttribute('aria-pressed', state[k]); render(); }));
  document.querySelectorAll('[data-vl]').forEach(b => b.addEventListener('click', () => { state.vlevel = state.vlevel === b.dataset.vl ? '' : b.dataset.vl; applyUI(); render(); }));
  $('#reset').addEventListener('click', () => resetFilters());
  TG.carousel($('#evlist'));
  applyUI(); render();

  // ---- hook for js/quiz.js ("Find my table"): the loaded places/events, the list's booking button, and its filters ----
  window.TGApp = { R, E, city, detailUrl, bookOn, booking,
    count: f => R.filter(r => matchF(r, f) && (!f.open || TG.openState(r).state === 'open')).length,
    show(f) { resetFilters(false); Object.assign(state, f); applyUI(); render(); document.getElementById('explore').scrollIntoView(); },
    showEvents(ev = '') { if (ev && !groups.some(g => g.id === ev)) ev = ''; state.ev = ev; $('#ev-chips').querySelectorAll('[data-ev]').forEach(x => x.setAttribute('aria-pressed', x.dataset.ev === ev));
      syncUrl(); renderEvents(); document.getElementById('events').scrollIntoView(); } };
  document.dispatchEvent(new CustomEvent('tg:ready'));
})();
