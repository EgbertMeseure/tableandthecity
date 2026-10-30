/* Table and the City – the per-city info pages: about.html ("About the data") and changes.html ("Latest changes").
   Same header / nav / footer / language switcher as the guide; the city comes from ?country=&city= (cities strictly separate:
   only that city's data/cities.json entry and its own data/cities/<city>.json changelog are read).
   Data content (the about text, place names, change notes) stays in the original English (#about-text / [data-i18n-skip], js/i18n.js). */
(async function () {
  const { esc, fmtDate, cityUrl } = TG;
  const PAGE = document.body.dataset.page;                                 // 'about' | 'changes'
  TG.bindNav();
  const { cfg, city, notice } = await TG.currentCity();
  TG.renderCitySel(cfg, city, PAGE + '.html'); TG.renderFooter(cfg, city);
  const $ = s => document.querySelector(s);
  $('#back').href = cityUrl('guide.html', city.id);
  $('#ih-city').textContent = city.name;
  if (notice) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }
  if (PAGE === 'about') {
    document.title = `About the data · ${city.name} — Table and the City`;
    if (city.about) $('#about-text').innerHTML = city.about;             // per-city text (data/cities.json); the static text is Gent's
    const ac = $('#about-city'); if (ac) ac.textContent = city.name;
    const c = (city.images || {}).heroCredit, el = $('#hero-credit');      // CC BY(-SA) city hero photo on the guide: author, licence, source
    if (c && el) el.innerHTML = `; city photo: <a href="${esc(c.source)}" target="_blank" rel="noopener">“${esc(c.title)}”</a> by ${esc(c.author)}, <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a> (cropped, greyscale; the crop is also ${esc(c.license)})`;
    document.body.classList.add('is-ready');
    return;
  }
  // ---- changes.html: the city's full changelog, newest first, grouped by month ----
  document.title = `Latest changes · ${city.name} — Table and the City`;
  document.body.classList.add('is-ready');
  let d = {};
  try { d = await fetch(TG.bust(city.data), { cache: 'no-cache' }).then(r => r.json()); } catch (e) { d = {}; }
  const names = new Map((d.restaurants || []).filter(r => r.status !== 'unverified').map(r => [r.name, r.id]));   // link a change to its place page when the name is one place of this city
  const list = (d.changelog || []).map((c, i) => ({ ...c, i })).filter(c => c && /^\d{4}-\d{2}/.test(c.date || ''))
    .sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i);            // newest first; same day: last added first
  const n = list.length;
  $('#clog-count').textContent = n ? `${n} change${n === 1 ? '' : 's'} in ${city.name}` : '';
  if (!n) { $('#clog').innerHTML = `<p class="clog-empty">No changes recorded for ${esc(city.name)} yet.</p>`; return; }
  const months = [];
  list.forEach(c => { const m = c.date.slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m, items: [] }); months[months.length - 1].items.push(c); });
  const place = name => { const id = names.get(name); return id ? `<a href="${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(id))}">${esc(name)}</a>` : esc(name); };
  $('#clog').innerHTML = months.map(g => `<section class="clog-month"><h2>${esc(fmtDate(g.m))}</h2><ul class="clog">${g.items.map(c => `
    <li><time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time><p><span data-i18n-skip>${c.restaurant ? `<strong>${place(c.restaurant)}</strong>: ` : ''}${esc(c.change || '')}</span>${/^https?:\/\//.test(c.source || '') ? ` <a class="clog__src" href="${esc(c.source)}" target="_blank" rel="noopener">Source</a>` : ''}</p></li>`).join('')}</ul></section>`).join('');
})();
