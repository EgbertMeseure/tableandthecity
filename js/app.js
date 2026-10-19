/* Table and the City – city overview page */
(async function () {
  const { esc, fmtDate, eur, known, priceNum, distRank, isStar, isUpcoming, badges, TYPE_IMG, TYPE_LABEL, haversine, cityUrl } = TG;
  TG.bindNav();
  const { cfg, city, notice } = await TG.currentCity();
  TG.renderCitySel(cfg, city); TG.renderFooter(cfg, city);
  const { restaurants: R, events: E, changelog } = await TG.load(city);
  const CITY = city.name;
  document.title = `Table and the City — ${CITY}: fine dining, bistros & chef events`;
  const $ = s => document.querySelector(s);
  const ADV = ['type', 'area', 'cuisine', 'price', 'dist'];          // behind "More filters"
  const QUICK = ['new', 'veggie', 'vegan', 'events'];                  // chips in the main row
  const DEF = { q: '', type: '', area: '', cuisine: '', price: '', dist: '', veggie: false, vegan: false, new: false, events: false, sort: 'rec', ev: '' };
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
  $('#lbl-count').textContent = `${R.length} addresses in ${CITY}`;
  $('#lbl-veg').textContent = `${R.filter(r => r.vegetarian === 'yes').length} veggie · ${R.filter(r => r.vegan === 'yes').length} vegan`;
  $('#lbl-ev').textContent = `${E.filter(isUpcoming).length} upcoming events & collaborations`;
  $('#explore-title').textContent = `All addresses in ${CITY}`; $('#about-city').textContent = CITY;
  if (notice) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }
  const checked = R.map(r => r.dateChecked).sort().pop();
  $('#checked').textContent = `Last checked: ${fmtDate(checked, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  // ---- category carousel ----
  const CATS = [
    { label: 'All', img: 'hero2', n: R.length },
    { label: 'Fine dining', img: 'finedining', key: 'type:fine dining' },
    { label: 'Gastro-bistro', img: 'bistro', key: 'type:gastro-bistro' },
    { label: 'Bistro & brasserie', img: 'nieuw', key: 'type:bistro+brasserie' },
    { label: 'Casual', img: 'casual', key: 'type:casual' },
    { label: 'Veggie & vegan', img: 'vegan', key: 'veggie' },
    { label: 'New', img: 'plated', key: 'new' },
    { label: 'Stars', img: 'events2', key: 'dist:star' },
    { label: 'Events', img: 'events', key: 'events' }
  ];
  const countFor = key => R.filter(r => matchKey(r, key)).length;
  function matchKey(r, key) {
    if (!key) return true;
    if (key.startsWith('type:')) return key.slice(5).split('+').includes(r.type);
    if (key === 'veggie') return r.vegetarian === 'yes';
    if (key === 'new') return r.isNew;
    if (key === 'events') return r.events.length > 0;
    if (key === 'dist:star') return isStar(r.distinctions.michelin);
    return true;
  }
  $('#carousel').innerHTML = CATS.map((c, i) => `
    <button class="pillcard bw-host grain" data-cat="${i}" aria-label="${esc(c.label)}">
      <img class="bw" ${TG.imgAttrs(c.img, '(max-width: 900px) 45vw, 240px')} alt="" loading="lazy">
      <span>${esc(c.label)}<small>${c.n ?? countFor(c.key)} addresses</small></span>
    </button>`).join('');
  $('#carousel').addEventListener('click', e => {
    if (TG.wasDragged($('#carousel'))) return;
    const b = e.target.closest('.pillcard'); if (!b) return;
    const c = CATS[+b.dataset.cat];
    resetFilters(false);
    if (c.key) {
      if (c.key.startsWith('type:')) state.type = c.key.slice(5);
      else if (c.key === 'dist:star') state.dist = 'star';
      else state[c.key] = true;
    }
    document.querySelectorAll('.pillcard').forEach(p => p.classList.toggle('active', p === b && !!c.key));
    applyUI(); render();
    if (c.key === 'events') document.getElementById('events').scrollIntoView(); else document.getElementById('explore').scrollIntoView();
  });
  TG.carousel($('#carousel'));

  // ---- filter options ----
  const opt = (sel, vals, fmt = v => v) => { $(sel).insertAdjacentHTML('beforeend', vals.map(v => `<option value="${esc(v)}">${esc(fmt(v))}</option>`).join('')); };
  opt('#f-type', ['fine dining', 'gastro-bistro', 'bistro', 'brasserie', 'casual', 'bistro+brasserie'], v => v === 'bistro+brasserie' ? 'Bistro + brasserie' : TYPE_LABEL[v]);
  const areas = [...new Set(R.map(r => r.district))].sort((a, b) => a.localeCompare(b, 'en'));
  const hoods = [...new Set(R.map(r => r.neighbourhood))].filter(h => !areas.includes(h)).sort((a, b) => a.localeCompare(b, 'en'));
  $('#f-area').insertAdjacentHTML('beforeend', `<optgroup label="District">${areas.map(a => `<option value="d:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup><optgroup label="Neighbourhood (OSM)">${hoods.map(a => `<option value="n:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup>`);
  opt('#f-cuisine', [...new Set(R.flatMap(r => r.cuisineTags))].sort((a, b) => a.localeCompare(b, 'en')));

  // ---- search ----
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  R.forEach(r => r._hay = norm([r.name, r.type, r.cuisine, r.cuisineTags.join(' '), r.chef, r.neighbourhood, r.district, r.address, r.menuType, r.menuChanges, r.currentMenuNote, r.dietNote, r.summary,
    r.distinctions.michelin, r.events.map(e => [e.title, e.type, (e.partners || []).join(' ')].join(' ')).join(' '), r.isNew ? 'new nieuw' : '', r.vegan === 'yes' ? 'vegan plant-based' : '', r.vegetarian === 'yes' ? 'veggie vegetarian' : '', r.original_nl ? Object.values(r.original_nl).join(' ') : ''].join(' ')));
  E.forEach(e => e._hay = norm([e.title, e.type, e.location, (e.partners || []).join(' '), e.restaurantNames.join(' '), e.note].join(' ')));
  const terms = () => norm(state.q).split(/\s+/).filter(Boolean);

  function filtered() {
    const t = terms();
    let list = R.filter(r => {
      if (t.length && !t.every(w => r._hay.includes(w))) return false;
      if (state.type && !state.type.split('+').includes(r.type)) return false;
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
    const meta = [TYPE_LABEL[r.type], r.cuisine.split(/[,–(]/)[0].trim(), r.neighbourhood, price].filter(Boolean).map(esc).join(' · ');
    const km = state.origin && r._km != null ? `<span>${r._km.toFixed(1)} km</span>` : '';
    const note = known(r.currentMenuNote) ? r.currentMenuNote : (known(r.menuType) ? r.menuType : '');
    return `<a class="card bw-host" href="${detailUrl(r.id)}" data-id="${esc(r.id)}">
      <div class="card__thumb">${TG.thumb(r, '80px')}</div>
      <div class="card__body"><div class="badges">${badges(r, { max: 2 })}</div><h3>${esc(r.name)}</h3><div class="card__meta" title="${meta}">${meta}</div>
      ${note ? `<p class="card__note">${esc(note)}</p>` : ''}
      <div class="card__foot">${km}${r.reservation_url ? `<span class="ext resv" data-href="${esc(r.reservation_url)}" role="link" tabindex="0" aria-label="Reserve at ${esc(r.name)} (opens booking page)">Reserve ↗</span>` : ''}${r.website ? `<span class="ext" data-href="${esc(r.website)}" role="link" tabindex="0">Website ↗</span>` : ''}<span>Checked ${esc(fmtDate(r.dateChecked))}</span></div></div></a>`;
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
      const m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: `<div class="mk${isStar(r.distinctions.michelin) ? ' star' : ''}" data-mk="${esc(r.id)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
        .bindPopup(`<b>${esc(r.name)}</b><br>${esc(TYPE_LABEL[r.type])} · ${esc(r.cuisine.split(/[,–(]/)[0])}<br>${esc(r.address)}<br><a href="${detailUrl(r.id)}">Details →</a>`);
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
    { id: 'festival', label: 'Festivals', re: /festival|culinary event/i }
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
  const openSheet = o => { sheet.classList.toggle('open', o); sheet.setAttribute('aria-hidden', !o); bd.hidden = !o; document.body.classList.toggle('noscroll', o); if (o) $('#f-type').focus(); };
  $('#btn-more').addEventListener('click', () => openSheet(true));
  [$('#mf-close'), bd].forEach(x => x.addEventListener('click', () => openSheet(false)));
  $('#mf-apply').addEventListener('click', () => { openSheet(false); document.getElementById('explore').scrollIntoView(); });
  $('#mf-clear').addEventListener('click', () => { ADV.forEach(k => state[k] = ''); document.querySelectorAll('.pillcard').forEach(p => p.classList.remove('active')); applyUI(); render(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) openSheet(false); });
  TG.carousel($('#evlist'));
  applyUI(); render();
})();
