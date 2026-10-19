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
  const state = { q: '', type: '', area: '', cuisine: '', price: '', dist: '', veggie: false, vegan: false, new: false, events: false, sort: 'name', origin: null, originLabel: '', evType: '', evPast: false };

  // ---- URL state (shareable filters; ?city= is always kept) ----
  const params = new URLSearchParams(location.search);
  ['q', 'type', 'area', 'cuisine', 'price', 'dist', 'sort'].forEach(k => params.get(k) && (state[k] = params.get(k)));
  ['veggie', 'vegan', 'new', 'events'].forEach(k => params.get(k) === '1' && (state[k] = true));
  function syncUrl() {
    const p = new URLSearchParams(); p.set('city', city.id);
    ['q', 'type', 'area', 'cuisine', 'price', 'dist'].forEach(k => state[k] && p.set(k, state[k]));
    if (state.sort !== 'name') p.set('sort', state.sort);
    ['veggie', 'vegan', 'new', 'events'].forEach(k => state[k] && p.set(k, '1'));
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
  }

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
    { label: 'All', img: 'img/hero2.jpg', n: R.length, apply: () => resetFilters() },
    { label: 'Fine dining', img: 'img/finedining.jpg', key: 'type:fine dining' },
    { label: 'Gastro-bistro', img: 'img/bistro.jpg', key: 'type:gastro-bistro' },
    { label: 'Bistro & brasserie', img: 'img/nieuw.jpg', key: 'type:bistro+brasserie' },
    { label: 'Casual', img: 'img/casual.jpg', key: 'type:casual' },
    { label: 'Veggie & vegan', img: 'img/vegan.jpg', key: 'veggie' },
    { label: 'New', img: 'img/interior.jpg', key: 'new' },
    { label: 'Stars', img: 'img/events2.jpg', key: 'dist:star' },
    { label: 'Events', img: 'img/events.jpg', key: 'events' }
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
      <img class="bw" src="${c.img}" alt="" loading="lazy">
      <span>${esc(c.label)}<small>${c.n ?? countFor(c.key)} addresses</small></span>
    </button>`).join('');
  $('#carousel').addEventListener('click', e => {
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
  document.querySelectorAll('[data-scroll]').forEach(a => a.addEventListener('click', () => $('#carousel').scrollBy({ left: +a.dataset.scroll * 300, behavior: 'smooth' })));

  // ---- filter options ----
  const opt = (sel, vals, fmt = v => v) => { $(sel).insertAdjacentHTML('beforeend', vals.map(v => `<option value="${esc(v)}">${esc(fmt(v))}</option>`).join('')); };
  opt('#f-type', ['fine dining', 'gastro-bistro', 'bistro', 'brasserie', 'casual', 'bistro+brasserie'], v => v === 'bistro+brasserie' ? 'Bistro + brasserie' : TYPE_LABEL[v]);
  const areas = [...new Set(R.map(r => r.district))].sort((a, b) => a.localeCompare(b, 'en'));
  const hoods = [...new Set(R.map(r => r.neighbourhood))].filter(h => !areas.includes(h)).sort((a, b) => a.localeCompare(b, 'en'));
  $('#f-area').insertAdjacentHTML('beforeend', `<optgroup label="District">${areas.map(a => `<option value="d:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup><optgroup label="Neighbourhood (OSM)">${hoods.map(a => `<option value="n:${esc(a)}">${esc(a)}</option>`).join('')}</optgroup>`);
  opt('#f-cuisine', [...new Set(R.flatMap(r => r.cuisineTags))].sort((a, b) => a.localeCompare(b, 'en')));
  opt('#ev-type', [...new Set(E.map(e => e.type))].sort((a, b) => a.localeCompare(b, 'en')));

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
    const by = {
      name: (a, b) => a.name.localeCompare(b.name, 'en'),
      score: (a, b) => distRank(b) - distRank(a) || a.name.localeCompare(b.name, 'en'),
      'price-asc': (a, b) => (priceNum(a.priceLevel) ?? 9) - (priceNum(b.priceLevel) ?? 9) || (a.priceFrom ?? 999) - (b.priceFrom ?? 999),
      'price-desc': (a, b) => (priceNum(b.priceLevel) ?? 0) - (priceNum(a.priceLevel) ?? 0) || (b.priceFrom ?? 0) - (a.priceFrom ?? 0),
      new: (a, b) => String(b.openingDate === 'unknown' ? (b.openingYear === 'unknown' ? '0' : b.openingYear) : b.openingDate).localeCompare(String(a.openingDate === 'unknown' ? (a.openingYear === 'unknown' ? '0' : a.openingYear) : a.openingDate)),
      dist: (a, b) => (a._km ?? 1e9) - (b._km ?? 1e9)
    };
    return list.sort(by[state.sort] || by.name);
  }

  // ---- map (greyscale) ----
  const map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView(city.center, city.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const layer = L.layerGroup().addTo(map); const markers = {}; let originMarker = null;
  map.on('click', e => setOrigin([e.latlng.lat, e.latlng.lng], 'chosen point'));
  function setOrigin(ll, label) {
    state.origin = ll; state.originLabel = label; state.sort = 'dist'; $('#sort').value = 'dist';
    if (originMarker) originMarker.remove();
    originMarker = L.circleMarker(ll, { radius: 8, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map).bindTooltip(label === 'my location' ? 'My location' : 'Starting point');
    $('#maphint').textContent = `Distance from ${label}`; render();
  }
  $('#btn-loc').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
    $('#btn-loc').textContent = '◎ Locating…';
    navigator.geolocation.getCurrentPosition(p => { $('#btn-loc').textContent = '◎ My location'; $('#btn-loc').setAttribute('aria-pressed', 'true'); setOrigin([p.coords.latitude, p.coords.longitude], 'my location'); map.setView([p.coords.latitude, p.coords.longitude], 13); },
      () => { $('#btn-loc').textContent = '◎ My location'; alert('Location unavailable. Click the map to choose a starting point instead.'); }, { timeout: 8000 });
  });

  // ---- render list + markers ----
  function card(r) {
    const meta = [TYPE_LABEL[r.type], r.cuisine.split(/[,–(]/)[0].trim(), r.neighbourhood, known(r.priceLevel) ? r.priceLevel : (r.priceFrom ? `from ${eur(r.priceFrom)}` : '')].filter(Boolean).map(esc).join(' · ');
    const km = state.origin && r._km != null ? `<span>${r._km.toFixed(1)} km</span>` : '';
    const note = known(r.currentMenuNote) ? r.currentMenuNote : (known(r.menuType) ? r.menuType : '');
    return `<a class="card bw-host" href="${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(r.id))}" data-id="${esc(r.id)}">
      <div class="card__thumb"><img class="bw" src="${TYPE_IMG[r.type]}" alt="" loading="lazy"></div>
      <div><div class="badges">${badges(r)}</div><h3>${esc(r.name)}</h3><div class="card__meta">${meta}</div>
      ${note ? `<p class="card__note">${esc(note)}</p>` : ''}
      <div class="card__foot">${km}${r.website ? `<span class="ext" data-href="${esc(r.website)}" role="link" tabindex="0" style="border-bottom:1px solid #000;color:#000">Website ↗</span>` : ''}<span>Last checked ${esc(fmtDate(r.dateChecked))}</span></div></div></a>`;
  }
  function render() {
    syncUrl();
    const list = filtered();
    $('#count').textContent = `${list.length} of ${R.length}` + (state.origin ? ` · distance from ${state.originLabel}` : '');
    $('#list').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">No addresses match this combination of filters. <button class="chip" style="margin-left:10px" onclick="document.getElementById(\'reset\').click()">Clear filters</button></div>';
    layer.clearLayers();
    list.forEach(r => {
      if (!r.lat) return;
      const star = isStar(r.distinctions.michelin);
      const m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: `<div class="mk${star ? ' star' : ''}" data-mk="${esc(r.id)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
        .bindPopup(`<b>${esc(r.name)}</b><br>${esc(TYPE_LABEL[r.type])} · ${esc(r.cuisine.split(/[,–(]/)[0])}<br>${esc(r.address)}<br><a href="${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(r.id))}">Details →</a>`);
      m.on('mouseover', () => hl(r.id, true)); m.on('mouseout', () => hl(r.id, false));
      markers[r.id] = m; m.addTo(layer);
    });
    renderEvents();
  }
  function hl(id, on) {
    document.querySelectorAll(`[data-mk="${CSS.escape(id)}"]`).forEach(x => x.classList.toggle('hl', on));
    const c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (c) c.classList.toggle('is-hover', on);
  }
  $('#list').addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, true); });
  $('#list').addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c) hl(c.dataset.id, false); });
  $('#list').addEventListener('click', e => { const x = e.target.closest('.ext'); if (x) { e.preventDefault(); window.open(x.dataset.href, '_blank', 'noopener'); } });

  // ---- events ----
  function renderEvents() {
    const t = terms();
    let ev = E.filter(e => (state.evPast || isUpcoming(e) || (!e.dateStart && e.dateText)) && (!state.evType || e.type === state.evType) && (!t.length || t.every(w => e._hay.includes(w))));
    ev.sort((a, b) => (a.dateStart || '9999').localeCompare(b.dateStart || '9999'));
    if (state.evPast) ev.sort((a, b) => { const ua = isUpcoming(a), ub = isUpcoming(b); return ua === ub ? (ua ? 1 : -1) * (a.dateStart || '0').localeCompare(b.dateStart || '0') : ua ? -1 : 1; });
    $('#ev-count').textContent = `${ev.length} event${ev.length === 1 ? '' : 's'}`;
    $('#evlist').innerHTML = ev.length ? ev.map(e => {
      const past = e.dateStart && !isUpcoming(e);
      const date = e.dateStart ? fmtDate(e.dateStart, { day: 'numeric', month: 'short' }) + (e.dateEnd ? ' <span class="dash">–</span> ' + fmtDate(e.dateEnd, { day: 'numeric', month: 'short' }) : '') + ' ' + e.dateStart.slice(0, 4) : esc(e.dateText || 'date unknown');
      const links = e.restaurantIds.map((id, i) => `<a href="${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(id))}">${esc(e.restaurantNames[i])}</a>`).join('');
      return `<article class="ev${past ? ' past' : ''}"><div class="ev__meta">${esc(e.type)}${past ? ' · past' : ''}</div><div class="ev__date">${date}</div>
        <div class="ev__title">${esc(e.title)}</div><div class="ev__meta">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
        ${e.note ? `<div class="ev__meta" style="text-transform:none;letter-spacing:.02em">${esc(e.note)}</div>` : ''}
        <div class="ev__links">${links}${(e.sources || []).slice(0, 2).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">Source ${i + 1} ↗</a>`).join('')}</div></article>`;
    }).join('') : '<div class="empty" style="color:#aaa">No events found' + (state.q ? ' for this search' : '') + '. Try “Show past” or clear the search.</div>';
  }
  $('#ev-type').addEventListener('change', e => { state.evType = e.target.value; renderEvents(); });
  $('#ev-past').addEventListener('click', e => { state.evPast = !state.evPast; e.target.setAttribute('aria-pressed', state.evPast); renderEvents(); });

  // ---- changelog ----
  $('#changelog').innerHTML = changelog.slice().reverse().slice(0, 8).map(c => `<li><strong>${esc(fmtDate(c.date))}</strong> — ${esc(c.restaurant)}: ${esc(c.change)}</li>`).join('');

  // ---- UI binding ----
  function applyUI() {
    $('#q').value = state.q; $('#q-hero').value = state.q;
    ['type', 'area', 'cuisine', 'price', 'dist'].forEach(k => $('#f-' + k).value = state[k]);
    $('#sort').value = state.sort;
    document.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-pressed', state[b.dataset.toggle]));
  }
  function resetFilters(rerender = true) {
    Object.assign(state, { q: '', type: '', area: '', cuisine: '', price: '', dist: '', veggie: false, vegan: false, new: false, events: false });
    document.querySelectorAll('.pillcard').forEach(p => p.classList.remove('active'));
    if (rerender) { applyUI(); render(); }
  }
  let tmr; const onQ = v => { state.q = v; clearTimeout(tmr); tmr = setTimeout(() => { applyUI(); render(); }, 120); };
  $('#q').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('input', e => onQ(e.target.value));
  $('#q-hero').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('explore').scrollIntoView(); });
  ['type', 'area', 'cuisine', 'price', 'dist'].forEach(k => $('#f-' + k).addEventListener('change', e => { state[k] = e.target.value; render(); }));
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; if (state.sort === 'dist' && !state.origin) $('#maphint').textContent = 'Click the map or use “My location”'; render(); });
  document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.toggle; state[k] = !state[k]; b.setAttribute('aria-pressed', state[k]); render(); }));
  $('#reset').addEventListener('click', () => resetFilters());
  applyUI(); render();
})();
