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
  const ADV = ['group', 'type', 'area', 'cuisine', 'price', 'dist'];          // behind "More filters"
  const QUICK = ['new', 'veggie', 'vegan', 'events'];                  // chips in the main row
  const DEF = { q: '', group: '', type: '', area: '', cuisine: '', price: '', dist: '', veggie: false, vegan: false, new: false, events: false, sort: 'rec', ev: '' };
  const state = { ...DEF, origin: null, originLabel: '' };

  // ---- URL state (shareable; ?country=&city= always kept) ----
  const params = new URLSearchParams(location.search);
  ['q', ...ADV, 'sort', 'ev'].forEach(k => params.get(k) && (state[k] = params.get(k)));
  QUICK.forEach(k => params.get(k) === '1' && (state[k] = true));
  if (!['rec', 'dist', 'new', 'price'].includes(state.sort)) state.sort = 'rec';
  function syncUrl() {
    const p = new URLSearchParams(); p.set('country', city.countryId); p.set('city', city.id);
    ['q', ...ADV, 'ev'].forEach(k => state[k] && p.set(k, state[k]));
    if (state.sort !== 'rec') p.set('sort', state.sort);
    QUICK.forEach(k => state[k] && p.set(k, '1'));
    history.replaceState(null, '', location.pathname + '?' + p + location.hash);
  }
  const advCount = () => ADV.filter(k => state[k]).length;
  const anyActive = () => !!(state.q || advCount() || QUICK.some(k => state[k]) || state.origin || state.sort !== 'rec');

  // ---- hero labels ----
  $('#lbl-count').textContent = `${R.length} places in ${CITY}`;
  $('#lbl-veg').textContent = `${R.filter(r => r.vegetarian === 'yes').length} veggie · ${R.filter(r => r.vegan === 'yes').length} vegan`;
  $('#lbl-ev').textContent = `${E.filter(isUpcoming).length} upcoming events & collaborations`;
  $('#explore-title').textContent = `All places in ${CITY}`; $('#about-city').textContent = CITY;
  if (notice) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }
  const checked = R.map(r => r.dateChecked).sort().pop();
  $('#checked').textContent = `Last checked: ${fmtDate(checked, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  // ---- "Choose your table": top-level group cards, each with a small sub-menu ----
  const sub = (label, f) => ({ label, f });
  const GROUPS = [
    { label: 'New', img: 'plated', f: { new: true }, subs: Object.keys(GROUP_LABEL).map(g => sub(GROUP_LABEL[g], { new: true, group: g })) },
    { label: 'Restaurants', img: 'finedining', f: { group: 'restaurants' }, subs: [
      sub('Fine dining', { group: 'restaurants', type: 'fine dining' }), sub('Gastro-bistro', { group: 'restaurants', type: 'gastro-bistro' }),
      sub('Bistro', { group: 'restaurants', type: 'bistro' }), sub('Brasserie', { group: 'restaurants', type: 'brasserie' }),
      sub('Casual', { group: 'restaurants', type: 'casual' }), sub('Veggie & vegan', { group: 'restaurants', veggie: true }),
      sub('Michelin', { group: 'restaurants', dist: 'michelin' })] },
    { label: 'Cafés & bars', img: 'bar', f: { group: 'cafes_bars' }, subs: [
      sub('Dance cafés', { group: 'cafes_bars', type: 'dance_cafe' }), sub('Brown cafés', { group: 'cafes_bars', type: 'brown_cafe' }),
      sub('Irish pubs', { group: 'cafes_bars', type: 'irish_pub' }), sub('Cafés', { group: 'cafes_bars', type: 'cafe' })] },
    { label: 'Coffee', img: 'coffee', f: { group: 'coffee' }, subs: [sub('Specialty coffee', { group: 'coffee', type: 'coffee_bar' })] },
    { label: 'Bakeries', img: 'bakery', f: { group: 'bakeries' }, subs: [sub('Bakeries', { group: 'bakeries', type: 'bakery' })] },
    { label: 'Events', img: 'events', f: { events: true }, subs: [], toEvents: true }
  ];
  const matchF = (r, f) => Object.entries(f).every(([k, v]) =>
    k === 'group' ? r.group === v : k === 'type' ? v.split('+').includes(r.category) : k === 'new' ? r.isNew :
    k === 'veggie' ? r.vegetarian === 'yes' : k === 'events' ? r.events.length > 0 : k === 'dist' ? !!r.distinctions.michelin : true);
  const countF = f => R.filter(r => matchF(r, f)).length;
  GROUPS.forEach(g => { g.n = g.toEvents ? E.filter(isUpcoming).length : countF(g.f); g.subs = g.subs.map(s => ({ ...s, n: countF(s.f) })).filter(s => s.n); });
  $('#carousel').innerHTML = GROUPS.map((c, i) => `
    <button class="pillcard bw-host grain" data-cat="${i}" aria-label="${esc(c.label)}, ${c.n} ${c.toEvents ? 'upcoming' : 'places'}"${c.subs.length ? ' aria-haspopup="menu" aria-expanded="false"' : ''}>
      <img class="bw" ${TG.imgAttrs(c.img, '(max-width: 900px) 45vw, 240px')} alt="" loading="lazy">
      <span>${esc(c.label)}<small>${c.n} ${c.toEvents ? 'upcoming' : 'places'}</small></span>
    </button>`).join('');
  function choose(g, f, btn) {
    resetFilters(false); Object.assign(state, f); closeMenu(false);
    document.querySelectorAll('.pillcard').forEach(p => p.classList.toggle('active', p === btn));
    applyUI(); render();
    document.getElementById(g.toEvents ? 'events' : 'explore').scrollIntoView();
  }
  // floating menu lives in <body> so the carousel's overflow cannot clip it
  const menu = document.createElement('div'); menu.className = 'catmenu'; menu.id = 'catmenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.appendChild(menu);
  let menuFor = null, tOpen, tClose, lastPtr = 'mouse';
  const hoverable = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  function openMenu(btn, { focus = false } = {}) {
    clearTimeout(tClose); const g = GROUPS[+btn.dataset.cat]; if (!g.subs.length) return;
    if (menuFor === btn && !menu.hidden) { if (focus) menu.querySelector('button').focus(); return; }
    closeMenu(false); menuFor = btn; btn.setAttribute('aria-expanded', 'true');
    const all = `<button role="menuitem" class="catmenu__all" data-s="-1">All ${esc(g.label.toLowerCase())}<span>${g.n}</span></button>`;
    menu.innerHTML = all + g.subs.map((s, j) => `<button role="menuitem" data-s="${j}">${esc(s.label)}<span>${s.n}</span></button>`).join('');
    menu.setAttribute('aria-label', g.label); menu.hidden = false; place();
    requestAnimationFrame(() => menu.classList.add('open'));
    if (focus) menu.querySelector('button').focus();
  }
  function place() {
    if (!menuFor) return; const r = menuFor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - mw - 8, r.left + r.width / 2 - mw / 2));
    // sits just under the card's label, over the lower half (extends below the card when the list is long)
    const top = Math.max(r.top + r.height * .58, r.bottom - mh - 18);
    menu.style.left = left + scrollX + 'px'; menu.style.top = top + scrollY + 'px';
  }
  function closeMenu(refocus) {
    clearTimeout(tOpen); clearTimeout(tClose); if (!menuFor) return;
    const btn = menuFor; btn.setAttribute('aria-expanded', 'false'); menuFor = null;
    menu.classList.remove('open'); menu.hidden = true; if (refocus) btn.focus();
  }
  const car = $('#carousel');
  car.addEventListener('pointerdown', e => { lastPtr = e.pointerType || 'mouse'; }, true);
  car.addEventListener('pointerover', e => {
    const b = e.target.closest('.pillcard'); if (!b || e.pointerType !== 'mouse' || !hoverable() || car.classList.contains('dragging') || e.buttons) return;
    clearTimeout(tClose); clearTimeout(tOpen); tOpen = setTimeout(() => openMenu(b), menuFor ? 0 : 140);
  });
  car.addEventListener('pointerout', e => {
    const b = e.target.closest('.pillcard'); if (!b || e.pointerType !== 'mouse' || (e.relatedTarget && b.contains(e.relatedTarget))) return;
    clearTimeout(tOpen); tClose = setTimeout(() => closeMenu(false), 220);
  });
  car.addEventListener('pointermove', e => { if (e.buttons & 1 && menuFor) closeMenu(false); });
  menu.addEventListener('pointerenter', () => clearTimeout(tClose));
  menu.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tClose = setTimeout(() => closeMenu(false), 220); });
  car.addEventListener('scroll', () => { if (menuFor && !menu.contains(document.activeElement)) closeMenu(false); else place(); }, { passive: true });
  addEventListener('resize', () => closeMenu(false));
  car.addEventListener('click', e => {
    if (TG.wasDragged(car)) return;
    const b = e.target.closest('.pillcard'); if (!b) return;
    const g = GROUPS[+b.dataset.cat];
    // touch / no-hover devices: first tap opens the menu (its first item selects the whole group)
    if (g.subs.length && (lastPtr !== 'mouse' || !hoverable()) && e.detail !== 0) { if (menuFor === b) closeMenu(false); else openMenu(b); return; }
    choose(g, g.f, b);
  });
  car.addEventListener('keydown', e => {
    const b = e.target.closest('.pillcard'); if (!b) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(b, { focus: true }); }
    else if (e.key === 'Escape') closeMenu(false);
  });
  menu.addEventListener('click', e => {
    const it = e.target.closest('[data-s]'); if (!it || !menuFor) return;
    const btn = menuFor, g = GROUPS[+btn.dataset.cat], j = +it.dataset.s;
    choose(g, j < 0 ? g.f : g.subs[j].f, btn);
  });
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('[data-s]')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) closeMenu(true); else items[i - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(true);
  });
  document.addEventListener('pointerdown', e => { if (menuFor && !menu.contains(e.target) && !menuFor.contains(e.target)) closeMenu(false); });
  TG.carousel($('#carousel'));

  // ---- filter options ----
  const opt = (sel, vals, fmt = v => v) => { $(sel).insertAdjacentHTML('beforeend', vals.map(v => `<option value="${esc(v)}">${esc(fmt(v))}</option>`).join('')); };
  opt('#f-group', Object.keys(GROUP_LABEL).filter(g => R.some(r => r.group === g)), g => GROUP_LABEL[g]);
  const CATS_BY_G = { restaurants: ['fine dining', 'gastro-bistro', 'bistro', 'brasserie', 'bistro+brasserie', 'casual', 'restaurant'], cafes_bars: ['dance_cafe', 'brown_cafe', 'irish_pub', 'cafe'], coffee: ['coffee_bar'], bakeries: ['bakery'] };
  const catOpt = v => v === 'bistro+brasserie' ? 'Bistro + brasserie' : v === 'restaurant' ? 'Restaurant (type not classified)' : CAT_LABEL[v];
  $('#f-type').insertAdjacentHTML('beforeend', Object.entries(CATS_BY_G).map(([g, vs]) => {
    const ok = vs.filter(v => R.some(r => v.split('+').includes(r.category)));
    return ok.length ? `<optgroup label="${esc(GROUP_LABEL[g])}">${ok.map(v => `<option value="${esc(v)}">${esc(catOpt(v))}</option>`).join('')}</optgroup>` : '';
  }).join(''));
  const areas = [...new Set(R.map(r => r.district))].sort((a, b) => a.localeCompare(b, 'en'));
  const hoods = [...new Set(R.map(r => r.neighbourhood))].filter(h => !areas.includes(h)).sort((a, b) => a.localeCompare(b, 'en'));
  $('#f-area').insertAdjacentHTML('beforeend', `<optgroup label="District">${areas.map(a => `<option value="d:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup><optgroup label="Neighbourhood (OSM)">${hoods.map(a => `<option value="n:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup>`);
  opt('#f-cuisine', [...new Set(R.flatMap(r => r.cuisineTags))].sort((a, b) => a.localeCompare(b, 'en')));

  // ---- search ----
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  R.forEach(r => r._hay = norm([r.name, r.type, catLabel(r), GROUP_LABEL[r.group], r.cuisine, r.cuisineTags.join(' '), r.chef, r.neighbourhood, r.district, r.address, r.menuType, r.menuChanges, r.currentMenuNote, r.dietNote, r.summary,
    r.distinctions.michelin, r.events.map(e => [e.title, e.type, (e.partners || []).join(' ')].join(' ')).join(' '), r.isNew ? 'new nieuw' : '', r.vegan === 'yes' ? 'vegan plant-based' : '', r.vegetarian === 'yes' ? 'veggie vegetarian' : '', r.original_nl ? Object.values(r.original_nl).join(' ') : ''].join(' ')));
  E.forEach(e => e._hay = norm([e.title, e.type, e.location, (e.partners || []).join(' '), e.restaurantNames.join(' '), e.note].join(' ')));
  const terms = () => norm(state.q).split(/\s+/).filter(Boolean);

  function filtered() {
    const t = terms();
    let list = R.filter(r => {
      if (t.length && !t.every(w => r._hay.includes(w))) return false;
      if (state.group && r.group !== state.group) return false;
      if (state.type && !state.type.split('+').includes(r.category)) return false;
      if (state.area) { const [k, v] = [state.area.slice(0, 1), state.area.slice(2)]; if (k === 'd' ? r.district !== v : r.neighbourhood !== v) return false; }
      if (state.cuisine && !r.cuisineTags.includes(state.cuisine)) return false;
      if (state.price && r.priceLevel !== state.price) return false;
      const d = r.distinctions;
      if (state.dist === 'star' && !isStar(d.michelin)) return false;
      if (state.dist === 'bib' && d.michelin !== 'Bib Gourmand') return false;
      if (state.dist === 'michelin' && !d.michelin) return false;
      if (state.dist === 'gm15' && !(d.gaultMillau >= 15)) return false;
      if (state.dist === 'gm13' && !(d.gaultMillau >= 13)) return false;
      if (state.dist === 'gm' && !d.gaultMillau) return false;
      if (state.veggie && r.vegetarian !== 'yes') return false;
      if (state.vegan && r.vegan !== 'yes') return false;
      if (state.new && !r.isNew) return false;
      if (state.events && !r.events.length) return false;
      return true;
    });
    if (state.origin) list.forEach(r => r._km = r.lat ? haversine(state.origin, [r.lat, r.lng]) : null);
    const nm = (a, b) => a.name.localeCompare(b.name, 'en');
    const opened = r => String(known(r.openingDate) ? r.openingDate : (known(r.openingYear) ? r.openingYear : '0'));
    const by = {
      rec: (a, b) => distRank(b) - distRank(a) || (b.isNew - a.isNew) || nm(a, b),
      price: (a, b) => (priceNum(a.priceLevel) ?? 9) - (priceNum(b.priceLevel) ?? 9) || (a.priceFrom ?? 999) - (b.priceFrom ?? 999) || nm(a, b),
      new: (a, b) => opened(b).localeCompare(opened(a)) || nm(a, b),
      dist: (a, b) => (a._km ?? 1e9) - (b._km ?? 1e9)
    };
    return list.sort(state.sort === 'dist' && !state.origin ? by.rec : (by[state.sort] || by.rec));
  }

  // ---- map (greyscale) ----
  const map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView(city.center, city.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const layer = L.layerGroup().addTo(map); let originMarker = null;
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
  function card(r) {
    const price = known(r.priceLevel) ? r.priceLevel : (r.priceFrom ? `from ${eur(r.priceFrom)}` : '');
    const isR = r.group === 'restaurants', cu = r.cuisine.split(/[,–(]/)[0].trim();
    const meta = [catLabel(r), isR && cu !== catLabel(r) ? cu : '', known(r.neighbourhood) ? r.neighbourhood : '', price].filter(Boolean).map(esc).join(' · ');
    const km = state.origin && r._km != null ? `<span>${r._km.toFixed(1)} km</span>` : '';
    const note = known(r.currentMenuNote) ? r.currentMenuNote : (known(r.menuType) ? r.menuType : (!isR && r.summary ? r.summary : ''));
    return `<a class="card bw-host" href="${detailUrl(r.id)}" data-id="${esc(r.id)}">
      <div class="card__thumb">${TG.thumb(r, '80px')}</div>
      <div class="card__body"><div class="badges">${badges(r, { max: 2 })}</div><h3>${esc(r.name)}</h3><div class="card__meta" title="${meta}">${meta}</div>
      ${note ? `<p class="card__note">${esc(note)}</p>` : ''}
      <div class="card__foot">${km}${isR && r.reservation_url ? `<span class="ext resv" data-href="${esc(r.reservation_url)}" role="link" tabindex="0" aria-label="Reserve at ${esc(r.name)} (opens booking page)">Reserve ↗</span>` : ''}${r.website ? `<span class="ext" data-href="${esc(r.website)}" role="link" tabindex="0">Website ↗</span>` : ''}<span>Checked ${esc(fmtDate(r.dateChecked))}</span></div></div></a>`;
  }
  function render() {
    syncUrl();
    const list = filtered();
    $('#count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;
    $('#mf-apply').textContent = `Show ${list.length} result${list.length === 1 ? '' : 's'}`;
    $('#reset').hidden = !anyActive();
    const n = advCount(); $('#more-n').hidden = !n; $('#more-n').textContent = n;
    $('#list').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">Nothing matches these filters. <button class="linkbtn" data-reset>Reset</button></div>';
    layer.clearLayers();
    list.forEach(r => {
      if (!r.lat) return;
      const m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: `<div class="mk g-${esc(r.group)}${isStar(r.distinctions.michelin) ? ' star' : ''}" data-mk="${esc(r.id)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
        .bindPopup(`<b>${esc(r.name)}</b><br>${esc([catLabel(r), r.group === 'restaurants' && r.cuisine !== catLabel(r) ? r.cuisine.split(/[,–(]/)[0] : ''].filter(Boolean).join(' · '))}<br>${esc(r.address)}<br><a href="${detailUrl(r.id)}">Details →</a>`);
      m.on('mouseover', () => hl(r.id, true)); m.on('mouseout', () => hl(r.id, false));
      m.addTo(layer);
    });
    renderEvents();
  }
  function hl(id, on) {
    document.querySelectorAll(`[data-mk="${CSS.escape(id)}"]`).forEach(x => x.classList.toggle('hl', on));
    const c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (c) c.classList.toggle('is-hover', on);
  }
  $('#list').addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, true); });
  $('#list').addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, false); });
  $('#list').addEventListener('click', e => {
    if (e.target.closest('[data-reset]')) { e.preventDefault(); resetFilters(); return; }
    const x = e.target.closest('.ext'); if (x) { e.preventDefault(); window.open(x.dataset.href, '_blank', 'noopener'); }
  });

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
      return `<article class="ev"><div class="ev__meta">${esc(e.type)}${e.recurrence && !/recurring/i.test(e.type) ? ' · recurring' : ''}</div><div class="ev__date">${date}</div>
        <div class="ev__title">${esc(e.title)}</div><div class="ev__meta">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
        ${e.note ? `<div class="ev__note">${esc(e.note)}</div>` : ''}
        <div class="ev__links">${links}${(e.sources || []).slice(0, 2).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">Source${e.sources.length > 1 ? ' ' + (i + 1) : ''} ↗</a>`).join('')}</div></article>`;
    }).join('') : '<div class="ev-empty"><p>No upcoming events match.</p><p class="sub">Try “All” or clear the search.</p></div>';
  }

  // ---- changelog ----
  $('#changelog').innerHTML = changelog.slice().reverse().slice(0, 8).map(c => `<li><strong>${esc(fmtDate(c.date))}</strong> — ${esc(c.restaurant)}: ${esc(c.change)}</li>`).join('');

  // ---- UI binding ----
  function applyUI() {
    $('#q').value = state.q; $('#q-hero').value = state.q;
    ADV.forEach(k => $('#f-' + k).value = state[k]);
    $('#sort').value = state.sort;
    document.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-pressed', state[b.dataset.toggle]));
    $('#btn-loc').setAttribute('aria-pressed', !!state.origin);
  }
  function resetFilters(rerender = true) {
    Object.assign(state, { ...DEF, ev: state.ev }); clearOrigin();
    document.querySelectorAll('.pillcard').forEach(p => p.classList.remove('active'));
    if (rerender) { applyUI(); render(); }
  }
  let tmr; const onQ = v => { state.q = v; clearTimeout(tmr); tmr = setTimeout(() => { applyUI(); render(); }, 120); };
  $('#q').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('explore').scrollIntoView(); });
  ADV.forEach(k => $('#f-' + k).addEventListener('change', e => { state[k] = e.target.value; render(); }));
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; if (state.sort === 'dist' && !state.origin) locate(); render(); });
  document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.toggle; state[k] = !state[k]; b.setAttribute('aria-pressed', state[k]); render(); }));
  $('#reset').addEventListener('click', () => resetFilters());
  // "More filters" sheet
  const sheet = $('#morefilters'), bd = $('#sheet-bd');
  const openSheet = o => { sheet.classList.toggle('open', o); sheet.setAttribute('aria-hidden', !o); bd.hidden = !o; document.body.classList.toggle('noscroll', o); if (o) $('#f-group').focus(); };
  $('#btn-more').addEventListener('click', () => openSheet(true));
  [$('#mf-close'), bd].forEach(x => x.addEventListener('click', () => openSheet(false)));
  $('#mf-apply').addEventListener('click', () => { openSheet(false); document.getElementById('explore').scrollIntoView(); });
  $('#mf-clear').addEventListener('click', () => { ADV.forEach(k => state[k] = ''); document.querySelectorAll('.pillcard').forEach(p => p.classList.remove('active')); applyUI(); render(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) openSheet(false); });
  TG.carousel($('#evlist'));
  applyUI(); render();
})();
