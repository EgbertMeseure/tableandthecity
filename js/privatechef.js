/* Table and the City – Private chefs, one quiet page per city (privatechef.html?country=&city=).
   Cities strictly separate: only this city's data/cities.json entry and its own data/cities/<city>-privatechefs.json are read.
   Record format (one file per city): { city, updated, note, chefs: [{ id, name, chef, style, description, serves, base, guests, price,
     website, instagram, email, phone, phoneDisplay, placeId (a place of this city in the guide), sources: [url], checked, image: null | { src, w, h, alt, credit, credit_url }, photos: [{ src, w, h, alt, credit, credit_url, kind: 'food' | 'chef' }],
     does: [{ k, src }] (services stated on the chef's own website; only these tiles are shown) }] }
   Facts only from the chef's own website (empty = unknown, never shown); photos only from the chef's own website, credited, else the monogram.
   Data text (names, descriptions, areas, prices) stays in the original English ([data-i18n-skip], js/i18n.js); labels are translated. */
(async function () {
  const { esc, cityUrl } = TG;
  TG.bindNav();
  const { cfg, city, notice } = await TG.currentCity();
  TG.renderCitySel(cfg, city, 'privatechef.html'); TG.renderFooter(cfg, city);
  const $ = s => document.querySelector(s);
  $('#back').href = cityUrl('guide.html', city.id);
  $('#ih-city').textContent = city.name;
  if (notice) { $('#city-notice').hidden = false; $('#city-notice').textContent = notice; }
  document.title = `Private chefs · ${city.name} — Table and the City`;
  document.body.classList.add('is-ready');
  let d = {};
  if (city.privatechefs) { try { d = await fetch(TG.bust(city.privatechefs), { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}); } catch (e) { d = {}; } }
  const list = (d.chefs || []).filter(c => c && c.name && (!d.city || d.city === city.id));
  const n = list.length;
  $('#pc-count').textContent = n ? `${n} private chef${n === 1 ? '' : 's'} in ${city.name}` : '';
  if (!n) { $('#pcgrid').innerHTML = `<p class="pc-empty">No private chefs listed for ${esc(city.name)} yet.</p>`; return; }
  const url = u => /^https?:\/\//.test(u || '');
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const mono = c => {
    const ini = TG.initials(c.name); let h = 0; for (const ch of c.id || c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="mono-thumb grain mt-finedining${ini.length > 1 ? ' two' : ''}" style="--ang:${h % 360}deg;--pos:${20 + h % 60}%" aria-hidden="true"><span>${esc(ini)}</span></span>`;
  };
  // ---- photos: c.image (the lead food photo) + c.photos (more food photos; the chef's own portrait, kind 'chef', always last), all from the chef's own
  //      website / public Instagram, credited. 2+ photos → a swipeable slot like the place page: touch swipe, small chevrons on desktop hover, a gold 1/n counter;
  //      slides after the first load lazily (data-src), the next one as soon as the card is hovered / touched / focused ----
  const credit = im => im.credit ? `<span class="pc__credit" data-i18n-skip>${url(im.credit_url) ? `<a href="${esc(im.credit_url)}" target="_blank" rel="noopener">${esc(im.credit)}</a>` : esc(im.credit)}</span>` : '';
  const imgTag = (im, lazy) => `<img ${lazy ? 'data-src' : 'src'}="${esc(im.src)}" width="${+im.w || 960}" height="${+im.h || 720}" alt="${esc(im.alt || '')}"${lazy ? '' : ' loading="lazy"'} decoding="async"${im.kind === 'chef' ? ' class="is-chef"' : ''}>`;
  const CHEV = d => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'}"/></svg>`;
  const photosOf = c => { const a = [c.image, ...(c.photos || [])].filter(im => im && im.src);
    return [...a.filter(im => im.kind !== 'chef'), ...a.filter(im => im.kind === 'chef').slice(0, 1)]; };
  const photo = c => {
    const ph = photosOf(c), n = ph.length;
    if (!n) return `<div class="pc__img">${mono(c)}</div>`;
    if (n === 1) return `<div class="pc__img">${mono(c)}<img src="${esc(ph[0].src)}" width="${+ph[0].w || 960}" height="${+ph[0].h || 720}" alt="${esc(ph[0].alt || '')}" loading="lazy" decoding="async" onerror="this.nextElementSibling&&this.nextElementSibling.remove();this.remove()">${credit(ph[0])}</div>`;
    return `<div class="pc__img pc__car" data-count="${n}">${mono(c)}<div class="pc__track" tabindex="0" role="group" aria-label="${n} photos, swipe for more">${ph.map((im, i) => `<div class="pc__slide">${imgTag(im, i > 0)}${credit(im)}</div>`).join('')}</div>
      <button type="button" class="pc__nav pc__nav--prev" aria-label="Previous photo" disabled>${CHEV(0)}</button><button type="button" class="pc__nav pc__nav--next" aria-label="Next photo">${CHEV(1)}</button>
      <span class="pc__cnt" aria-hidden="true"><b>1</b>/${n}</span></div>`;
  };
  const bindCar = () => document.querySelectorAll('.pc__car').forEach(slot => {
    const tr = slot.querySelector('.pc__track'), n = +slot.dataset.count, cnt = slot.querySelector('.pc__cnt b');
    const pv = slot.querySelector('.pc__nav--prev'), nx = slot.querySelector('.pc__nav--next');
    const load = upto => [...tr.querySelectorAll('img[data-src]')].forEach(im => { const k = [...tr.children].indexOf(im.parentNode); if (k <= upto) { im.src = im.dataset.src; im.removeAttribute('data-src'); } });
    const cur = () => Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    const upd = () => { const i = Math.min(n - 1, cur()); cnt.textContent = i + 1; pv.disabled = i <= 0; nx.disabled = i >= n - 1; load(i + 1); };
    const go = d => { load(cur() + 1 + d); tr.scrollTo({ left: (cur() + d) * tr.clientWidth, behavior: 'smooth' }); };
    pv.addEventListener('click', () => go(-1)); nx.addEventListener('click', () => go(1));
    tr.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
    ['pointerenter', 'touchstart', 'focusin'].forEach(ev => slot.addEventListener(ev, () => load(1), { once: true, passive: true }));
    tr.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(e.key === 'ArrowRight' ? 1 : -1); } });
  });
  const fact = (label, v) => v ? `<div><dt>${label}</dt><dd data-i18n-skip>${esc(v)}</dd></div>` : '';
  const links = c => {
    const a = [];
    if (url(c.website)) a.push(`<a class="pc-btn pc-btn--main" href="${esc(c.website)}" target="_blank" rel="noopener" aria-label="Website of ${esc(c.name)}">Website</a>`);
    if (url(c.instagram)) a.push(`<a class="pc-btn" href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    if (c.email) a.push(`<a class="pc-btn" href="mailto:${esc(c.email)}">Email</a>`);
    if (c.phone) a.push(`<a class="pc-btn" href="tel:${esc(c.phone)}" title="${esc(c.phoneDisplay || c.phone)}">Call</a>`);
    return a.length ? `<div class="pc__links">${a.join('')}</div>` : '';
  };
  const srcs = c => (c.sources || []).filter(url);
  // ---- 'What they do': the restaurant page's feature tiles (.ftgrid / .ft.on), but only the services this chef's own website states — no grey 'not confirmed' tiles ----
  const DOES = [['menu', 'Menu made to measure'], ['shopping', 'Does the shopping'], ['tableware', 'Brings tableware'], ['service', 'Serves at table'], ['cleanup', 'Cleans up after'],
    ['vegetarian', 'Vegetarian menu'], ['vegan', 'Vegan menu'], ['diets', 'Allergies & diets'], ['kids', 'Kids’ menu'], ['wine', 'Matching wines'], ['winelist', 'Wine list'], ['winetasting', 'Wine tasting'],
    ['class', 'Cooking class'], ['walking', 'Walking dinner'], ['buffet', 'Buffet'], ['bbq', 'Barbecue'], ['business', 'Business dinners'], ['chefsplace', 'Dinner at the chef’s place']];
  const CHECK = '<svg class="ft__ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';
  const does = c => {
    const m = new Map((c.does || []).filter(x => x && x.k).map(x => [x.k, x.src]));
    const on = DOES.filter(([k]) => m.has(k));
    return on.length ? `<div class="pc__does"><p class="pc__does-h">What they do</p><ul class="ftgrid pc__ft">${on.map(([k, l]) => `<li class="ft on" data-k="${k}" data-state="yes"${url(m.get(k)) ? ` title="${esc(host(m.get(k)))}"` : ''}>${CHECK}<span>${esc(l)}</span></li>`).join('')}</ul></div>` : '';
  };
  $('#pcgrid').innerHTML = list.map(c => `
    <article class="pc" id="pc-${esc(c.id)}">
      ${photo(c)}
      <div class="pc__body">
        ${c.style ? `<p class="pc__style" data-i18n-skip>${esc(c.style)}</p>` : ''}
        <h3 class="pc__name" data-i18n-skip>${esc(c.name)}</h3>
        ${c.chef && c.chef !== c.name ? `<p class="pc__chef"><span>Chef</span> <span data-i18n-skip>${esc(c.chef)}</span></p>` : ''}
        ${c.description ? `<p class="pc__desc" data-i18n-skip>${esc(c.description)}</p>` : ''}
        ${does(c)}
        <dl class="pc__facts">${fact('Serves', c.serves)}${fact('Based in', c.base)}${fact('Guests', c.guests)}${fact('Price', c.price)}${c.phone ? fact('Phone', c.phoneDisplay || c.phone) : ''}</dl>
        ${links(c)}
        <p class="pc__src">${srcs(c).length ? `<span>Source</span> <a href="${esc(srcs(c)[0])}" target="_blank" rel="noopener" data-i18n-skip>${esc(host(srcs(c)[0]))}</a>` : ''}${c.placeId ? `${srcs(c).length ? ' · ' : ''}<a href="${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(c.placeId))}">Also in the guide</a>` : ''}</p>
      </div>
    </article>`).join('');
  bindCar();
})();
