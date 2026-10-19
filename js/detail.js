/* Table and the City – restaurant detail page (full colour) */
(async function () {
  const { esc, fmtDate, eur, known, badges, TYPE_LABEL, cityUrl } = TG;
  TG.bindNav();
  const { cfg, city } = await TG.currentCity();
  TG.renderCitySel(cfg, city);
  const { restaurants: R } = await TG.load(city);
  const id = new URLSearchParams(location.search).get('id');
  const r = R.find(x => x.id === id);
  const $ = s => document.querySelector(s);
  $('#back').href = cityUrl('index.html', city.id, '#explore');
  if (!r) {
    TG.renderFooter(cfg, city);
    $('#hname').textContent = 'Not found';
    $('#left').innerHTML = `<p>This restaurant is not in the ${esc(city.name)} list (it may have closed or moved). <a href="${cityUrl('index.html', city.id)}">Back to the overview</a>.</p>`;
    return;
  }
  const long = { day: 'numeric', month: 'long', year: 'numeric' };
  TG.renderFooter(cfg, city, `Last checked ${esc(fmtDate(r.dateChecked, long))}`);
  document.title = `${r.name} — ${city.name} — Table and the City`;
  const canon = `https://tableandthecity.com/${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(r.id))}`;
  document.querySelector('meta[property="og:title"]').content = `${r.name} — Table and the City`;
  document.querySelector('meta[property="og:url"]').content = canon;
  document.head.insertAdjacentHTML('beforeend', `<link rel="canonical" href="${esc(canon)}">`);
  $('#himg').outerHTML = `<img class="dhero__img" id="himg" ${TG.imgAttrs(TG.TYPE_KEY[r.type] || 'hero2')} alt="" fetchpriority="high">`;
  $('#hbadges').innerHTML = badges(r);
  $('#hname').textContent = r.name;
  $('#hmeta').textContent = [TYPE_LABEL[r.type], r.cuisine, r.neighbourhood].join(' · ');
  const yn = v => v === 'yes' ? '<span class="yes">yes</span>' : v === 'no' ? '<span class="no">no</span>' : '<span class="unk">unknown</span>';
  const unk = v => known(v) ? esc(v) : `<span class="unk">${esc(v || 'unknown')}</span>`;
  const d = r.distinctions;
  const dist = [d.michelin ? `${esc(d.michelin)} (Michelin ${d.michelinYear})` : 'Not in the Michelin Guide (or unknown)', d.gaultMillau ? `Gault&amp;Millau ${d.gaultMillau}/20 (${d.gaultMillauEdition} edition)` : 'No Gault&amp;Millau score found'].join('<br>');
  const opening = known(r.openingDate) ? fmtDate(r.openingDate, long) : (known(r.openingYear) ? r.openingYear : 'unknown');
  const fact = (dt, dd, wide) => `<div class="fact${wide ? ' wide' : ''}"><dt>${dt}</dt><dd>${dd}</dd></div>`;
  const guide = r.sources[0] && r.sources[0].includes('michelin') ? 'MICHELIN Guide' : 'Gault&amp;Millau';
  $('#left').innerHTML = `
    ${r.summary ? `<p class="summary" lang="${esc(r.summaryLang || 'nl')}">${esc(r.summary)}</p><p class="summary-lang">${guide} inspector description · original Dutch</p>` : ''}
    ${r.status !== 'open' ? `<div class="conflict"><strong>Status: ${esc(r.status)}.</strong> ${esc(r.statusNote)}</div>` : ''}
    ${r.dataConflict ? `<div class="conflict"><strong>Note:</strong> ${esc(r.dataConflict)}</div>` : ''}
    <dl class="facts">
      ${fact('Type', esc(TYPE_LABEL[r.type]))}${fact('Cuisine', esc(r.cuisine))}
      ${fact('Chef / team', unk(r.chef))}${fact('Price', (known(r.priceLevel) ? esc(r.priceLevel) + ' (Michelin)' : '<span class="unk">Price level unknown</span>') + (r.priceFrom ? `<br>from ${eur(r.priceFrom)} (lowest menu/lunch in a source)` : ''))}
      ${fact('Distinctions', dist, true)}
      ${fact('Vegetarian', yn(r.vegetarian))}${fact('Vegan', yn(r.vegan))}
      ${r.dietNote ? fact('Dietary notes', esc(r.dietNote), true) : ''}
      ${fact('Menu type', unk(r.menuType))}${fact('Does the menu change?', unk(r.menuChanges))}
      ${fact('On the menu now', unk(r.currentMenuNote), true)}
      ${fact('Opened', esc(String(opening)) + (r.isNew ? ' — <strong>new</strong>' : ''))}${fact('Last checked', esc(fmtDate(r.dateChecked, long)) + `<br><span class="unk">last changed ${esc(fmtDate(r.lastChanged))}</span>`)}
    </dl>
    <h2>Events &amp; collaborations</h2>
    ${r.events.length ? r.events.slice().sort((a, b) => a.dateStart.localeCompare(b.dateStart)).map(e => `<div class="dev"><div class="ev__meta">${esc(e.type)}${e.recurrence ? ' · recurring' : ' · upcoming'}</div>
      <div class="ev__date">${e.dateStart ? esc(fmtDate(e.dateStart, long)) + (e.dateEnd ? ' <span class="dash">–</span> ' + esc(fmtDate(e.dateEnd, { day: 'numeric', month: 'long' })) : '') : esc(e.dateText || 'date unknown')}</div>
      <div>${esc(e.title)}</div><div class="ev__meta" style="margin-top:6px">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
      ${e.note ? `<div style="font-size:12px;color:var(--accent-soft);margin-top:4px">${esc(e.note)}</div>` : ''}
      <div style="font-size:12px;margin-top:6px">${(e.sources || []).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')}</div></div>`).join('') : '<p class="unk">No upcoming events or collaborations right now.</p>'}
  `;
  $('#right').innerHTML = `
    <h2>Address</h2><p style="font-size:15px;margin:0 0 14px">${esc(r.address)}<br><span class="unk">${esc(r.neighbourhood)} · ${esc(r.district)}</span>${r.phone ? `<br>${esc(r.phone)}` : ''}</p>
    <div class="dmap" id="dmap"></div>
    <div class="dcta">${r.website ? `<a class="pill-btn dark" href="${esc(r.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
      ${r.instagram ? `<a class="pill-btn dark" href="${esc(r.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>` : ''}
      <a class="pill-btn dark" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}" target="_blank" rel="noopener">Directions ↗</a></div>
    <h2>Sources</h2><ol class="sources">${r.sources.map(s => s.startsWith('http') ? `<li><a href="${esc(s.split(' ')[0])}" target="_blank" rel="noopener">${esc(s)}</a></li>` : `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="up" style="color:var(--accent-soft)">Coordinates: ${esc(r.geoSource)}</p>`;

  // ---- gallery: category pills + masonry + lightbox; Instagram embeds (official embed.js, lazy) ----
  const CATL = { food: 'Food', interior: 'Atmosphere', chef: 'Chef', exterior: 'Exterior' };
  const photos = (r.photos || []).filter(p => CATL[p.category]);
  let gcat = '', shown = [], idx = 0;
  const isStock = p => p.source === 'stock';
  const capOf = p => `${esc(p.alt || '')}<span class="lb__credit">${isStock(p) ? 'Mood image, not from this restaurant · ' : (p.source === 'google_places' ? 'Google Maps · ' : '')}Photo: ${p.credit_url ? `<a href="${esc(p.credit_url)}" target="_blank" rel="noopener">${esc(p.credit)}</a>` : esc(p.credit || 'unknown')}${p.source_url ? ` · <a href="${esc(p.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</span>`;
  if (!photos.length && !(r.instagram_posts || []).length) $('#gallery').hidden = true;
  const cats = Object.keys(CATL).filter(c => photos.some(p => p.category === c));
  $('#gal-chips').innerHTML = [['', 'All'], ...cats.map(c => [c, CATL[c]])].map(([c, l]) => `<button class="chip" data-gc="${c}" aria-pressed="${c === ''}">${l}<span class="cnt">${c ? photos.filter(p => p.category === c).length : photos.length}</span></button>`).join('');
  $('#gal-note').textContent = photos.every(isStock) ? 'Mood images from Unsplash to give a feel for this kind of place — not photos of this restaurant.' : '';
  function renderGallery() {
    shown = photos.filter(p => !gcat || p.category === gcat);
    $('#gal-grid').innerHTML = shown.map((p, i) => `<figure class="tile">
      <button class="tile__btn" data-i="${i}" aria-label="Open photo ${i + 1}: ${esc(p.alt || CATL[p.category])}">
        <img src="${esc(p.thumb || p.src)}" srcset="${esc(p.thumb || p.src)} 800w, ${esc(p.src)} 1600w" sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 380px" width="${p.w || 800}" height="${p.h || 600}" loading="lazy" decoding="async" alt="${esc(p.alt || '')}">
        <span class="tile__tag">${CATL[p.category]}${isStock(p) ? '<span class="mi"> · mood image</span>' : ''}</span></button></figure>`).join('');
  }
  $('#gal-chips').addEventListener('click', e => { const b = e.target.closest('[data-gc]'); if (!b) return; gcat = b.dataset.gc;
    $('#gal-chips').querySelectorAll('[data-gc]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderGallery(); });
  const lb = $('#lb'); let lastFocus = null;
  function show(i) { idx = (i + shown.length) % shown.length; const p = shown[idx]; const im = $('#lb-img');
    im.src = p.src; im.alt = p.alt || ''; $('#lb-cap').innerHTML = `<span class="lb__count">${idx + 1} / ${shown.length} · ${CATL[p.category]}</span>${capOf(p)}`; }
  function openLb(i) { lastFocus = document.activeElement; lb.hidden = false; document.body.classList.add('noscroll'); show(i); $('#lb-close').focus(); }
  function closeLb() { lb.hidden = true; document.body.classList.remove('noscroll'); if (lastFocus) lastFocus.focus(); }
  $('#gal-grid').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) openLb(+b.dataset.i); });
  $('#lb-prev').addEventListener('click', () => show(idx - 1)); $('#lb-next').addEventListener('click', () => show(idx + 1));
  $('#lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
  let x0 = null; lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });
  renderGallery();
  const posts = (r.instagram_posts || []).filter(u => /^https:\/\/www\.instagram\.com\/(p|reel)\//.test(u));
  $('#ig').innerHTML = (posts.length ? `<h3>On Instagram</h3><div class="iggrid">${posts.map(u => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(u)}" data-instgrm-version="14"><a href="${esc(u)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`).join('')}</div>` : '')
    + (r.instagram ? `<a class="pill-btn dark" href="${esc(r.instagram)}" target="_blank" rel="noopener">See ${esc(r.name)} on Instagram ↗</a>` : '');
  if (posts.length) new IntersectionObserver((en, ob) => { if (en.some(x => x.isIntersecting)) { ob.disconnect(); const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.instagram.com/embed.js'; document.body.appendChild(sc); } }, { rootMargin: '400px' }).observe($('#ig'));
  if (r.lat) {
    const m = L.map('dmap', { scrollWheelZoom: false }).setView([r.lat, r.lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    L.circleMarker([r.lat, r.lng], { radius: 10, color: '#111', weight: 2, fillColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c8a96a', fillOpacity: 1 }).addTo(m).bindPopup(`<b>${esc(r.name)}</b>`).openPopup();
  }
})();
