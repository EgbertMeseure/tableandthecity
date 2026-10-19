/* Table and the City – restaurant detail page (full colour) */
(async function () {
  const { esc, fmtDate, eur, known, badges, TYPE_IMG, TYPE_LABEL, isUpcoming, cityUrl } = TG;
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
  $('#himg').src = TYPE_IMG[r.type] || 'img/hero2.jpg';
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
    ${r.events.length ? r.events.slice().sort((a, b) => (b.dateStart || '').localeCompare(a.dateStart || '')).map(e => `<div class="dev"><div class="ev__meta">${esc(e.type)}${e.dateStart && !isUpcoming(e) ? ' · past' : (e.dateStart ? ' · upcoming' : '')}</div>
      <div class="ev__date">${e.dateStart ? esc(fmtDate(e.dateStart, long)) + (e.dateEnd ? ' <span class="dash">–</span> ' + esc(fmtDate(e.dateEnd, { day: 'numeric', month: 'long' })) : '') : esc(e.dateText || 'date unknown')}</div>
      <div>${esc(e.title)}</div><div class="ev__meta" style="margin-top:6px">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
      ${e.note ? `<div style="font-size:12px;color:var(--accent-soft);margin-top:4px">${esc(e.note)}</div>` : ''}
      <div style="font-size:12px;margin-top:6px">${(e.sources || []).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')}</div></div>`).join('') : '<p class="unk">No events or collaborations found at the last check.</p>'}
  `;
  $('#right').innerHTML = `
    <h2>Address</h2><p style="font-size:15px;margin:0 0 14px">${esc(r.address)}<br><span class="unk">${esc(r.neighbourhood)} · ${esc(r.district)}</span>${r.phone ? `<br>${esc(r.phone)}` : ''}</p>
    <div class="dmap" id="dmap"></div>
    <div class="dcta">${r.website ? `<a class="pill-btn dark" href="${esc(r.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
      ${r.instagram ? `<a class="pill-btn dark" href="${esc(r.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>` : ''}
      <a class="pill-btn dark" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}" target="_blank" rel="noopener">Directions ↗</a></div>
    <h2>Sources</h2><ol class="sources">${r.sources.map(s => s.startsWith('http') ? `<li><a href="${esc(s.split(' ')[0])}" target="_blank" rel="noopener">${esc(s)}</a></li>` : `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="up" style="color:var(--accent-soft)">Coordinates: ${esc(r.geoSource)}</p>`;
  if (r.lat) {
    const m = L.map('dmap', { scrollWheelZoom: false }).setView([r.lat, r.lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    L.circleMarker([r.lat, r.lng], { radius: 10, color: '#111', weight: 2, fillColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c8a96a', fillOpacity: 1 }).addTo(m).bindPopup(`<b>${esc(r.name)}</b>`).openPopup();
  }
})();
