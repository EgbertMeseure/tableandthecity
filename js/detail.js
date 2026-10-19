/* Table and the City – restaurant detail page (full colour) */
(async function () {
  const { esc, fmtDate, eur, known, badges, TYPE_LABEL, catLabel, cityUrl } = TG;
  const isR = r => r.group === 'restaurants';
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
  TG.renderFooter(cfg, city);
  document.title = `${r.name} — ${city.name} — Table and the City`;
  const canon = `https://tableandthecity.com/${cityUrl('restaurant.html', city.id, '&id=' + encodeURIComponent(r.id))}`;
  document.querySelector('meta[property="og:title"]').content = `${r.name} — Table and the City`;
  document.querySelector('meta[property="og:url"]').content = canon;
  document.head.insertAdjacentHTML('beforeend', `<link rel="canonical" href="${esc(canon)}">`);
  // ---- hero: a real, freely licensed photo of the restaurant if we have one; otherwise a neutral typographic hero ----
  const own = TG.realPhotos(r);
  const heroP = own.find(p => p.category === 'exterior' || p.category === 'interior') || own[0];
  if (heroP) {
    $('#himg').outerHTML = `<img class="dhero__img" id="himg" src="${esc(heroP.src)}" ${heroP.srcset ? `srcset="${esc(heroP.srcset)}" sizes="100vw"` : ''} alt="${esc(heroP.alt || r.name)}" fetchpriority="high">`;
    $('.dhero .credit').innerHTML = `Photo: ${heroP.credit_url ? `<a href="${esc(heroP.credit_url)}" target="_blank" rel="noopener">${esc(heroP.credit)}</a>` : esc(heroP.credit)} · ${esc(heroP.license || '')}${heroP.source_url ? ` · <a href="${esc(heroP.source_url)}" target="_blank" rel="noopener">Wikimedia Commons</a>` : ''}`;
  } else {
    $('#himg').remove(); $('.dhero .credit').remove();
    const top = document.querySelector('.dhero'); top.classList.add('dhero--plain');
    top.insertAdjacentHTML('afterbegin', `<span class="dhero__mono" aria-hidden="true">${esc((r.name.match(/[A-Za-zÀ-ž]/) || ['T'])[0].toUpperCase())}</span>`);
  }
  $('#hbadges').innerHTML = badges(r);
  $('#hname').textContent = r.name;
  $('#hmeta').textContent = [catLabel(r), isR(r) && r.cuisine !== catLabel(r) ? r.cuisine : '', known(r.neighbourhood) ? r.neighbourhood : ''].filter(Boolean).join(' · ');
  const d = r.distinctions || {};
  const priceTxt = [known(r.priceLevel) ? esc(r.priceLevel) : '', r.priceFrom ? `from ${eur(r.priceFrom)}` : ''].filter(Boolean).join(' · ') || '<span class="unk">unknown</span>';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const hours = r.openingHours && known(r.openingHours) ? esc(r.openingHours) : '';
  // ---- feature tiles: green only when verified "yes" in sourced data ----
  const { F, EV, TILES } = TG.featureTiles(r);
  const live = r.events || [];
  const CHECK = '<svg class="ft__ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';
  const tiles = TILES.map(([k, l]) => {
    const v = F[k];
    const tip = v === true ? (EV[k] ? `Confirmed — ${EV[k]}` : 'Confirmed') : v === false ? 'No' : 'Not confirmed';
    return `<li class="ft${v === true ? ' on' : ''}" title="${esc(tip)}" data-state="${v === true ? 'yes' : v === false ? 'no' : 'unknown'}">${v === true ? CHECK : ''}<span>${l}</span><span class="sr">: ${esc(tip)}</span></li>`;
  }).join('');
  const nYes = TILES.filter(([k]) => F[k] === true).length;
  // ---- "Know this place?" visitor feedback: tap pills (has it / doesn't / neutral), optional note, one Send. Never changes data. ----
  const FB_SKIP = new Set(['events', 'chefCollabs', 'michelin', 'gaultMillau', 'new']);   // computed or editorial, not for visitors
  const FB = TILES.filter(([k]) => !FB_SKIP.has(k));
  const feedbackBlock = `<section class="fb" id="fb" aria-labelledby="fb-h">
      <h3 id="fb-h">Know this place? <span>Help us keep it right</span></h3>
      <p class="fb__hint">Tap once = has it, twice = doesn’t have it, three times = not sure.</p>
      <div class="fb__pills" role="group" aria-label="Features">${FB.map(([k, l]) => `<button type="button" class="fbp" data-k="${k}" data-v="" aria-label="${esc(l)}: not sure">${esc(l)}</button>`).join('')}</div>
      <details class="fb__more"><summary>Add a note (optional)</summary><input type="text" id="fb-note" maxlength="200" placeholder="e.g. closed on Mondays now" aria-label="Note (optional)"></details>
      <input type="text" id="fb-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="fb__hp">
      <div class="fb__actions"><button type="button" class="pill-btn sm fb-send" id="fb-send" disabled>Send</button>
        <a class="pill-btn sm dark" id="fb-mail" hidden target="_blank" rel="noopener">Email us</a></div>
      <p class="fb__msg" id="fb-msg" role="status" aria-live="polite"></p></section>`;
  // ---- reserve: own booking URL (verified) > website > phone ----
  const resv = !isR(r) || r.fromUpcoming ? null : r.reservation_url ? { href: r.reservation_url, label: 'Reserve' } : r.website ? { href: r.website, label: 'Reserve' } : r.phone ? { href: 'tel:' + r.phone.replace(/[^\d+]/g, ''), label: 'Call to reserve' } : null;
  // ---- announced openings (data/cities/<city>-upcoming.json): expected date + the announcement itself ----
  const expTxt = r.fromUpcoming ? (TG.expectedText(r, true) || 'Soon — date not announced yet') : '';
  const src0 = (r.sources || [])[0];
  const openingBox = !r.fromUpcoming ? '' : `<div class="soonbox"><strong>${r.upcoming ? `Opening soon${TG.expectedText(r, true) ? ' · ' + esc(TG.expectedText(r, true)) : ''}` : `Just opened · announced for ${esc(expTxt)}`}.</strong>
      ${r.expectedOpeningNote ? esc(r.expectedOpeningNote) + ' ' : ''}${r.upcoming ? 'Not open yet — details may change.' : 'We have not re-checked the opening yet.'}
      ${src0 ? `<a href="${esc(src0)}" target="_blank" rel="noopener">Read the announcement${r.announcedBy ? ` (${esc(r.announcedBy.split(';')[0])})` : ''} ↗</a>` : ''}</div>`;
  const sourcesLine = `<details class="srcline"><summary>Sources</summary>
      <ol class="sources">${r.sources.map(s => s.startsWith('http') ? `<li><a href="${esc(s.split(' ')[0])}" target="_blank" rel="noopener">${esc(s)}</a></li>` : `<li>${esc(s)}</li>`).join('')}</ol>
      <p>${r.fromUpcoming ? '' : `Last changed ${esc(fmtDate(r.lastChanged))} · `}Coordinates: ${esc(r.geoSource)}${r.openingHoursSource && hours ? ` · Hours: ${esc(r.openingHoursSource)}` : ''}${r.reservation_url ? ` · Booking link taken from ${esc(host(r.website))}` : ''}</p></details>`;
  $('#left').innerHTML = `
    ${r.summary ? `<p class="summary" lang="${esc(r.summaryLang || 'nl')}">${esc(r.summary)}</p>` : ''}
    ${r.fromUpcoming ? openingBox : ''}
    ${r.status !== 'open' ? `<div class="conflict"><strong>Status: ${esc(r.status)}.</strong> ${esc(r.statusNote)}</div>` : ''}
    ${r.dataConflict ? `<div class="conflict"><strong>Note:</strong> ${esc(r.dataConflict)}</div>` : ''}
    <dl class="essentials">
      ${r.fromUpcoming ? `<div><dt>${r.upcoming ? 'Expected opening' : 'Opened'}</dt><dd>${esc(expTxt)}</dd></div>` : ''}
      <div><dt>Address</dt><dd>${esc(r.address)}</dd></div>
      ${r.fromUpcoming && r.team ? `<div><dt>Team</dt><dd>${esc(r.team)}</dd></div>` : ''}
      ${r.phone ? `<div><dt>Phone</dt><dd><a href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a></dd></div>` : ''}
      ${r.website ? `<div><dt>Website</dt><dd><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(host(r.website))}</a></dd></div>` : ''}
      ${(isR(r) && !r.upcoming) || known(r.priceLevel) ? `<div><dt>Price</dt><dd>${priceTxt}</dd></div>` : ''}
      ${hours ? `<div><dt>Hours</dt><dd>${hours}</dd></div>` : ''}
      ${known(r.menuType) ? `<div><dt>Menu</dt><dd>${esc(r.menuType)}</dd></div>` : ''}
    </dl>
    <h2 class="ft-head">At a glance <span class="ft-legend"><i class="sw on"></i>confirmed <i class="sw"></i>no / not confirmed</span></h2>
    <ul class="ftgrid" aria-label="Features (${nYes} confirmed)">${tiles}</ul>
    ${feedbackBlock}
    <h2>${isR(r) ? 'Events &amp; collaborations' : 'Events'}</h2>
    ${live.length ? live.slice().sort((a, b) => a.dateStart.localeCompare(b.dateStart)).map(e => `<div class="dev"><div class="ev__when"><span class="ev__date">${e.dateStart ? esc(fmtDate(e.dateStart, long)) + (e.dateEnd ? ' <span class="dash">–</span> ' + esc(fmtDate(e.dateEnd, { day: 'numeric', month: 'long' })) : '') : esc(e.dateText || 'date unknown')}</span><span class="ev__type">${esc(e.type)}${e.recurrence ? ' · recurring' : ' · upcoming'}</span></div>
      <h3 class="ev__title" title="${esc(e.title)}">${esc(e.title)}</h3><div class="ev__meta ev__venue">${esc(e.location || '')}${e.partners && e.partners.length ? ' · with ' + esc(e.partners.join(', ')) : ''}</div>
      <div style="font-size:12px;margin-top:6px">${(e.sources || []).map((s, i) => `<a href="${esc(s)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')}</div></div>`).join('') : `<p class="unk">No upcoming ${isR(r) ? 'events or collaborations' : 'events'} listed right now.</p>`}
    ${sourcesLine}`;
  bindFeedback();
  function bindFeedback() {
    const C = window.TG_CONFIG || {}, box = $('#fb'); if (!box) return;
    const pageUrl = location.href.split('#')[0], subject = `Table and the City – ${r.name}`;
    const LABEL = Object.fromEntries(FB), NEXT = { '': 'yes', yes: 'no', no: '' }, SAY = { '': 'not sure', yes: 'has it', no: 'doesn’t have it' };
    const changes = () => [...box.querySelectorAll('.fbp')].filter(b => b.dataset.v).map(b => ({ feature: b.dataset.k, label: LABEL[b.dataset.k], value: b.dataset.v === 'yes' }));
    const note = () => $('#fb-note').value.trim().slice(0, 200);
    const mailBody = (ch, n) => [`Place: ${r.name} (${r.id}), ${city.name}`, `Page: ${pageUrl}`, '',
      ...(ch.length ? ['Visitor says:', ...ch.map(c => `- ${c.label}: ${c.value ? 'yes, has it' : 'no, doesn’t have it'}`)] : []), ...(n ? ['', `Note: ${n}`] : [])].join('\n');
    const mailto = (ch, n) => `mailto:${(C.FEEDBACK_EMAIL || '').replace(/[^\w.+@-]/g, '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody(ch, n))}`;
    const mail = $('#fb-mail'); if (C.FEEDBACK_EMAIL) { mail.hidden = false; mail.href = mailto([], ''); }
    const send = $('#fb-send'), msg = $('#fb-msg');
    const refresh = () => { send.disabled = !(changes().length || note()); if (C.FEEDBACK_EMAIL) mail.href = mailto(changes(), note()); };
    box.addEventListener('click', e => { const b = e.target.closest('.fbp'); if (!b) return; b.dataset.v = NEXT[b.dataset.v];
      b.setAttribute('aria-label', `${LABEL[b.dataset.k]}: ${SAY[b.dataset.v]}`); refresh(); });
    $('#fb-note').addEventListener('input', refresh);
    // rate limit per page: max 3 sends per 24 h (localStorage)
    const RL = 'tg-fb-' + city.id + '-' + r.id, DAY = 864e5;
    const sent = () => { try { return JSON.parse(localStorage.getItem(RL) || '[]').filter(t => Date.now() - t < DAY); } catch (_) { return []; } };
    const thanks = () => { msg.textContent = 'Thanks! We’ll check it.'; box.classList.add('done'); box.querySelectorAll('.fbp').forEach(b => { b.dataset.v = ''; }); $('#fb-note').value = ''; refresh(); };
    send.addEventListener('click', async () => {
      const ch = changes(), n = note(); if (!ch.length && !n) return;
      if ($('#fb-hp').value) { thanks(); return; }                         // honeypot filled → silently drop
      const prev = sent(); if (prev.length >= 3) { msg.textContent = 'Thanks — we already received your notes for this place today.'; return; }
      const payload = { placeId: r.id, placeName: r.name, city: city.id, changes: ch, note: n, url: pageUrl, timestamp: new Date().toISOString() };
      if (!C.FEEDBACK_ENDPOINT) { location.href = mailto(ch, n); try { localStorage.setItem(RL, JSON.stringify([...prev, Date.now()])); } catch (_) {} thanks(); return; }
      send.disabled = true; msg.textContent = 'Sending…';
      try {
        const res = await fetch(C.FEEDBACK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...(C.FEEDBACK_ACCESS_KEY ? { access_key: C.FEEDBACK_ACCESS_KEY } : {}), subject, from_name: 'Table and the City feedback', ...payload, changes_text: mailBody(ch, n) }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        try { localStorage.setItem(RL, JSON.stringify([...prev, Date.now()])); } catch (_) {}
        thanks();
      } catch (_) {
        msg.innerHTML = `Couldn’t send right now.${C.FEEDBACK_EMAIL ? ` <a href="${esc(mailto(ch, n))}">Email it instead</a>.` : ' Please try again later.'}`; refresh();
      }
    });
  }
  $('#right').innerHTML = `
    <div class="dcta">
      ${resv ? `<a class="pill-btn reserve" id="reserve" href="${esc(resv.href)}" ${resv.href.startsWith('tel:') ? '' : 'target="_blank" rel="noopener"'}>${resv.label}${resv.href.startsWith('tel:') ? '' : ' ↗'}</a>` : ''}
      ${r.website ? `<a class="pill-btn dark" href="${esc(r.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
      ${r.instagram ? `<a class="pill-btn dark" href="${esc(r.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>` : ''}
      <a class="pill-btn dark" id="directions" href="${esc(TG.directionsUrl(r))}" target="_blank" rel="noopener" aria-label="Directions to ${esc(r.name)} in Google Maps (new tab)">Directions ↗</a></div>
    ${r.reservation_url ? `<p class="resv-note">Books via ${esc(r.reservation_provider && r.reservation_provider !== 'own page' ? r.reservation_provider : host(r.reservation_url))}, as linked on the restaurant's own website.</p>` : (resv ? `<p class="resv-note">No online booking link found — ${resv.href.startsWith('tel:') ? 'book by phone' : 'see the restaurant’s website'}.</p>` : '')}
    <div class="dmap" id="dmap"></div>
    <p class="dmap-cap">${esc(r.neighbourhood)} · ${esc(r.district)}</p>`;

  // ---- gallery: only real photos of this restaurant (freely licensed, e.g. Wikimedia Commons) + official Instagram embeds ----
  const CATL = { food: 'Food', interior: 'Atmosphere', chef: 'Chef', exterior: 'Exterior', other: 'More' };
  const photos = own.filter(p => CATL[p.category]);
  const posts = (r.instagram_posts || []).map(p => typeof p === 'string' ? { url: p } : p).filter(p => /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(p.url));
  const handle = r.instagram_handle || (r.instagram ? r.instagram.replace(/\/+$/, '').split('/').pop() : '');
  let gcat = '', shown = [], idx = 0;
  const capOf = p => `${esc(p.alt || '')}<span class="lb__credit">${p.source === 'google_places' ? 'Google Maps · ' : ''}Photo: ${p.credit_url ? `<a href="${esc(p.credit_url)}" target="_blank" rel="noopener">${esc(p.credit)}</a>` : esc(p.credit || 'unknown')}${p.license ? ` · ${p.license_url ? `<a href="${esc(p.license_url)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}` : ''}${p.source_url ? ` · <a href="${esc(p.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</span>`;
  const all = [...photos.map(p => ({ kind: 'photo', cat: p.category, p })), ...posts.map(p => ({ kind: 'ig', cat: CATL[p.category] ? p.category : '', p }))];
  const cats = Object.keys(CATL).filter(c => all.some(x => x.cat === c));
  $('#gal-chips').innerHTML = all.length > 1 && cats.length > 1 ? [['', 'All'], ...cats.map(c => [c, CATL[c]])].map(([c, l]) => `<button class="chip" data-gc="${c}" aria-pressed="${c === ''}">${l}<span class="cnt">${c ? all.filter(x => x.cat === c).length : all.length}</span></button>`).join('') : '';
  $('#gal-note').innerHTML = posts.length ? `Posts from the restaurant’s official Instagram${handle ? ` <a href="https://www.instagram.com/${esc(handle)}/" target="_blank" rel="noopener">@${esc(handle)}</a>` : ''}, shown with Instagram’s own embed.${photos.length ? ' Photos: freely licensed, credited per image.' : ''}` : (photos.length ? 'Freely licensed photos of this restaurant, credited per image.' : '');
  let igLoaded = false;
  function loadIg() {
    if (igLoaded || !document.querySelector('#gal-grid .instagram-media')) return; igLoaded = true;
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.instagram.com/embed.js'; document.body.appendChild(sc);
  }
  function renderGallery() {
    const sel = all.filter(x => !gcat || x.cat === gcat);
    shown = sel.filter(x => x.kind === 'photo').map(x => x.p);
    let pi = 0;
    $('#gal-grid').innerHTML = sel.map(x => x.kind === 'photo' ? `<figure class="tile">
      <button class="tile__btn" data-i="${pi++}" aria-label="Open photo: ${esc(x.p.alt || CATL[x.p.category])}">
        <img src="${esc(x.p.thumb || x.p.src)}" srcset="${esc(x.p.thumb || x.p.src)} 800w, ${esc(x.p.src)} 1600w" sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 380px" width="${x.p.w || 800}" height="${x.p.h || 600}" loading="lazy" decoding="async" alt="${esc(x.p.alt || '')}">
        <span class="tile__tag">${CATL[x.p.category]}</span></button></figure>`
      : `<figure class="tile tile--ig"><blockquote class="instagram-media" data-instgrm-permalink="${esc(x.p.url)}?utm_source=ig_embed" data-instgrm-version="14"><a href="${esc(x.p.url)}" target="_blank" rel="noopener">View this post on Instagram${handle ? ` · @${esc(handle)}` : ''}</a></blockquote></figure>`).join('');
    if (igLoaded) { igLoaded = false; loadIg(); }
  }
  if (!all.length) {
    $('#gal-grid').outerHTML = `<div class="gal-empty"><p class="gal-empty__t">Photos coming soon</p><p>We only show photos from the restaurant itself or under a free licence. Until then, see ${r.instagram ? `<a href="${esc(r.instagram)}" target="_blank" rel="noopener">${esc(r.name)} on Instagram</a>${r.website ? ' or ' : ''}` : ''}${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">their website</a>` : ''}.</p></div>`;
  } else renderGallery();
  $('#ig').innerHTML = handle ? `<a class="pill-btn dark" href="https://www.instagram.com/${esc(handle)}/" target="_blank" rel="noopener">More on Instagram @${esc(handle)} ↗</a>` : '';
  if (posts.length) new IntersectionObserver((en, ob) => { if (en.some(x => x.isIntersecting)) { ob.disconnect(); loadIg(); } }, { rootMargin: '300px' }).observe($('#gallery'));
  $('#gal-chips').addEventListener('click', e => { const b = e.target.closest('[data-gc]'); if (!b) return; gcat = b.dataset.gc;
    $('#gal-chips').querySelectorAll('[data-gc]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderGallery(); });
  const lb = $('#lb'); let lastFocus = null;
  function show(i) { idx = (i + shown.length) % shown.length; const p = shown[idx]; const im = $('#lb-img');
    im.src = p.src; im.alt = p.alt || ''; $('#lb-cap').innerHTML = `<span class="lb__count">${idx + 1} / ${shown.length} · ${CATL[p.category]}</span>${capOf(p)}`; }
  function openLb(i) { lastFocus = document.activeElement; lb.hidden = false; document.body.classList.add('noscroll'); show(i); $('#lb-close').focus(); }
  function closeLb() { lb.hidden = true; document.body.classList.remove('noscroll'); if (lastFocus) lastFocus.focus(); }
  document.addEventListener('click', e => { const b = e.target.closest('#gal-grid [data-i]'); if (b) openLb(+b.dataset.i); });
  $('#lb-prev').addEventListener('click', () => show(idx - 1)); $('#lb-next').addEventListener('click', () => show(idx + 1));
  $('#lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
  let x0 = null; lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });
  if (r.lat) {
    const m = L.map('dmap', { scrollWheelZoom: false }).setView([r.lat, r.lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    L.circleMarker([r.lat, r.lng], { radius: 10, color: '#111', weight: 2, fillColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c8a96a', fillOpacity: 1 }).addTo(m).bindPopup(`<b>${esc(r.name)}</b>`).openPopup();
  }
})();
