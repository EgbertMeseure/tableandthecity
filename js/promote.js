/* Table and the City – "Promote your place" (promote.html) and its thank-you page (promote-thanks.html). PREVIEW: not linked from the site, noindex.
   Packages, prices and Stripe Payment Links come from js/promote-config.js (window.TG_PROMOTE); nothing is hard-coded here.
   Buy = the package's Stripe Payment Link + ?client_reference_id=<city>__<package id>&locale=<ui language>, so every payment says which city and
   package it is for (Stripe shows it on the payment and sends it in the checkout.session.completed webhook). Empty stripeUrl → a disabled "Coming soon".
   Copy is English here and translated by js/i18n.js (keys in scripts/i18n_strings.txt); price lines are formatted per language. */
(async function () {
  const { esc, cityUrl } = TG;
  const I = window.TG_I18N || { t: s => s, lang: 'en' }, t = (k, v) => I.t ? I.t(k, v) : k;
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

  /* what each card lists under the description (English keys, translated by js/i18n.js) */
  const GETS = {
    'top-list': ['First in its category list in the city you pick', 'Marked Promoted, with your photo and details', 'At most two promoted places per list, so it stays a guide'],
    'city-page': ['A Featured row of up to four places at the top of the city page', 'Your photo, name and type, linked to your page in the guide', 'Four slots per city; when they are full, you start in the next free week'],
    'ig-story': ['One story, live for 24 hours', 'A link sticker to your website or booking page', 'Your handle tagged'],
    'ig-shared': ['Your place in a carousel with three to five good places', 'Your photo, one line about you and your handle tagged', 'Stays on our profile'],
    'ig-own': ['Up to ten photos of your place in one carousel', 'A short text in our own voice, facts checked with you', 'A collab invite, so it can show on your profile too'],
    'bundle': ['Your own Instagram post', 'One Instagram story', 'Top of the list for one month', 'Top of the city page for one week']
  };
  /* small schematic previews (no photos): grey blocks, the bought spot in petrol */
  const row = (on, tag) => `<span class="pmv-row${on ? ' is-on' : ''}"><i></i><b></b>${tag ? '<em>Promoted</em>' : ''}</span>`;
  const VIS = {
    'top-list': `<div class="pmv pmv--list"><span class="pmv-bar"></span>${row(1, 1)}${row()}${row()}${row()}</div>`,
    'city-page': `<div class="pmv pmv--city"><span class="pmv-hero"></span><span class="pmv-feat"><i class="is-on"></i><i></i><i></i><i></i></span>${row()}${row()}</div>`,
    'ig-story': `<div class="pmv pmv--ig"><span class="pmv-story"><span class="pmv-prog"></span><span class="pmv-stick"></span></span></div>`,
    'ig-shared': `<div class="pmv pmv--ig"><span class="pmv-post pmv-post--grid"><i class="is-on"></i><i></i><i></i><i></i></span></div>`,
    'ig-own': `<div class="pmv pmv--ig"><span class="pmv-post pmv-post--own"><span class="pmv-dots"><i class="is-on"></i><i></i><i></i></span></span></div>`,
    'bundle': `<div class="pmv pmv--bundle"><span class="pmv-story"><span class="pmv-prog"></span><span class="pmv-stick"></span></span><span class="pmv-post pmv-post--own"><span class="pmv-dots"><i class="is-on"></i><i></i><i></i></span></span><span class="pmv-mini">${row(1, 1)}${row()}${row()}</span></div>`
  };
  const groups = [];
  P.packages.forEach(p => { let g = groups.find(x => x.id === p.group); if (!g) groups.push(g = { id: p.group, section: p.section, items: [] }); g.items.push(p); });
  const pick = {};                                                        // group → chosen package id
  groups.forEach(g => { pick[g.id] = g.items[0].id; });

  const buyHref = p => {
    try { const u = new URL(p.stripeUrl); u.searchParams.set('client_reference_id', `${city.id}__${p.id}`); if (I.lang) u.searchParams.set('locale', I.lang); return u.href; }
    catch (e) { return ''; }
  };
  const card = g => {
    const p = g.items.find(x => x.id === pick[g.id]) || g.items[0], href = /^https:\/\//.test(p.stripeUrl || '') ? buyHref(p) : '';
    const durs = g.items.length > 1
      ? `<div class="pm-durs" role="group" aria-label="Duration">${g.items.map(x => `<button type="button" class="pm-chip" data-pick="${esc(x.id)}" aria-pressed="${x.id === p.id}">${esc(x.duration)}</button>`).join('')}</div>`
      : `<p class="pm-dur1">${esc(p.duration)}</p>`;
    const worth = p.worth ? `<span class="pm-price__worth">${esc(t('Worth {a}, you save {b}', { a: eur(p.worth), b: eur(p.worth - p.price) }))}</span>` : '';
    return `<div class="pm-card__vis" aria-hidden="true">${VIS[g.id] || ''}</div>
      <div class="pm-card__body">
        <h3 class="pm-card__name">${esc(p.name)}</h3>
        <p class="pm-card__desc">${esc(p.description)}</p>
        <ul class="pm-gets">${(GETS[g.id] || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="pm-card__foot">
          ${durs}
          <p class="pm-price"><span class="pm-price__ex">${esc(eur(p.price))}</span><span class="pm-price__tax">excl. VAT</span>${worth}
            <span class="pm-price__inc">${esc(t('{p} incl. {v}% VAT', { p: eur(inc(p.price)), v: vatPct }))}</span></p>
          ${href ? `<a class="pm-buy" href="${esc(href)}" rel="noopener">Buy now</a>`
                 : `<button type="button" class="pm-buy is-soon" disabled aria-disabled="true">Coming soon</button>`}
          ${p.perCity ? `<p class="pm-for">${esc(t('For {city}', { city: t(city.name) }))}</p>` : ''}
        </div>
      </div>`;
  };
  const renderCards = () => document.querySelectorAll('.pmgrid[data-section]').forEach(grid => {
    grid.innerHTML = groups.filter(g => g.section === grid.dataset.section).map(g => `<article class="pm-card pm-card--${esc(g.id)}" data-group="${esc(g.id)}">${card(g)}</article>`).join('');
  });
  const renderCities = () => {
    $('#pm-cities').innerHTML = cities.map(c => `<button type="button" class="pm-chip" data-city="${esc(c.id)}" aria-pressed="${c.id === city.id}">${esc(c.name)}</button>`).join('');
    $('#pm-guide-lede').textContent = t('Placements on the website and in the app, in {city}.', { city: t(city.name) });
  };
  const render = () => { renderCities(); renderCards(); document.title = t('Promote your place · {city} — Table and the City', { city: t(city.name) }); };
  render();
  document.addEventListener('click', e => {
    const d = e.target.closest('[data-pick]');
    if (d) { const art = d.closest('.pm-card'), g = groups.find(x => x.id === art.dataset.group); pick[g.id] = d.dataset.pick; art.innerHTML = card(g);
      const again = art.querySelector(`[data-pick="${d.dataset.pick}"]`); if (again) again.focus(); return; }
    const c = e.target.closest('[data-city]');
    if (c && c.closest('#pm-cities')) {
      city = cities.find(x => x.id === c.dataset.city) || city;
      const u = new URL(location.href); u.searchParams.set('country', city.countryId); u.searchParams.set('city', city.id); history.replaceState(null, '', u);
      head(city); render(); const again = $(`#pm-cities [data-city="${city.id}"]`); if (again) again.focus();
    }
  });
})();
