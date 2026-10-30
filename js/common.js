/* Shared helpers – Table and the City */
const TG = (() => {
  const BRAND = 'Table and the City';
  const LOCALE = 'en-GB';
  /* "today" in the guide's time zone (Europe/Brussels), computed once at page load */
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const U = 'unknown';
  const TYPE_KEY = { 'fine dining': 'finedining', 'gastro-bistro': 'bistro', 'bistro': 'nieuw', 'brasserie': 'casual', 'casual': 'interior' };
  const TYPE_IMG = Object.fromEntries(Object.entries(TYPE_KEY).map(([k, v]) => [k, `img/${v}.jpg`]));
  /* responsive <img> attributes for a site image key (img/<key>-{800,1600,2400}.webp, jpg fallback) */
  const imgAttrs = (key, sizes = '100vw') => `src="img/${key}.jpg" srcset="img/${key}-800.webp 800w, img/${key}-1600.webp 1600w, img/${key}-2400.webp 2400w" sizes="${sizes}"`;
  /* real, licensed photos of a restaurant only (Commons / own / Google Places when a key is configured) — never stock, never Instagram */
  /* cache-busting: data fetches carry the page's build stamp (<meta name="build">, set by scripts/stamp_assets.py) */
  const BUILD = (document.querySelector('meta[name="build"]') || {}).content || '';
  const bust = u => BUILD ? `${u}${u.includes('?') ? '&' : '?'}v=${BUILD}` : u;
  function realPhotos(r) {
    const GKEY = (window.TG_CONFIG || {}).googleMapsKey || '';
    const g = GKEY ? (r.google_photos || []).map(p => {
      const a = (p.authorAttributions || [])[0] || {};
      const u = w => `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=${w}&key=${encodeURIComponent(GKEY)}`;
      return { src: u(1600), thumb: u(400), w: p.widthPx, h: p.heightPx, category: 'other', alt: `${r.name} — photo via Google Maps`, credit: a.displayName || 'Google Maps user', credit_url: a.uri, source: 'google_places', license: 'Google Maps' };
    }) : [];
    return [...(r.photos || []).filter(p => p.source !== 'stock' && p.source !== 'instagram_embed'), ...g];
  }
  const STOP = /^(de|het|le|la|les|l|the|by|and|&|'t|t|di|della|il|a|-|–)$/i;
  function initials(name) {
    const w = String(name).replace(/[.,]/g, '').split(/\s+/).filter(x => x && !STOP.test(x) && !/^[dl]['’]\p{L}{0,3}$/iu.test(x));
    const pick = w.length ? w : [String(name)];
    const first = s => (s.match(/[\p{L}\p{N}]/u) || [''])[0].toUpperCase();
    return pick.length === 2 && !/^\d/.test(pick[1]) ? first(pick[0]) + first(pick[1]) : first(pick[0]);   // two-word names → two initials
  }
  /* the place's own Instagram post permalinks (verified), as {url, category}. Photos of people (chef, staff, guests, portraits:
     category chef / people, set by the photo review in data/osm/photo-review.json, scripts/apply_photo_review.py) are never shown — only food, drinks, the interior … */
  const PEOPLE_CAT = /^(chef|people|person|staff|portrait|team|graphic)$/;   // graphic = poster / text card, not a photo of the place
  const igPostsOf = r => (r.instagram_posts || []).map(p => typeof p === 'string' ? { url: p } : p).filter(p => /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(p.url) && !PEOPLE_CAT.test(p.category || ''));
  /* the post a card / hero shows: a photo post (not a reel), food / drinks / interior first, then unreviewed, then exterior */
  const POST_RANK = { food: 0, drink: 0, interior: 0, '': 1, other: 1, exterior: 2 };
  const bestPost = posts => { const ph = posts.filter(x => /\/p\//.test(x.url)), pool = ph.length ? ph : posts, rk = x => POST_RANK[x.category || ''] ?? 1;
    return pool.reduce((b, x) => (!b || rk(x) < rk(b) ? x : b), null); };
  const CFG = () => window.TG_CONFIG || {};
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  /* the photo a card / hero shows, in order: the photo research's pick (<city>-photos.json: own website photo, hotlinked, or own
     Instagram post) → free-licence or own photo (food / drinks / interior first) → the place's own website og:image (hotlinked)
     → best Instagram photo post (official embed) → Instagram profile grid (off by default, config.igProfileEmbeds) → null.
     A place on hold (only photos with people exist) shows nothing: the neutral monogram. */
  const PHOTO_RANK = { food: 0, drink: 0, interior: 0, exterior: 1, other: 2 };
  const bestPhoto = own => own.reduce((b, x) => (!b || (PHOTO_RANK[x.category] ?? 2) < (PHOTO_RANK[b.category] ?? 2) ? x : b), null);
  /* the research pick as {photo} or {post}, when it is still there */
  const pickOf = r => { const k = r.photoPick; if (!k) return {};
    return k.type === 'photo' ? { photo: realPhotos(r).find(x => x.src === k.src) } : { post: igPostsOf(r).find(x => x.url === k.url) }; };
  const igPostCard = (r, hp) => ({ kind: 'igpost', embed: hp.url.replace(/\/$/, '') + '/embed/', href: hp.url, credit: `Photo: ${r.igHandle ? '@' + r.igHandle : 'Instagram'} on Instagram` });
  function cardPhoto(r, forCard) {
    if (r.photoHold) return null;
    const pk = pickOf(r);
    if (pk.post && !(forCard && !igCardsOn())) return igPostCard(r, pk.post);
    const p = pk.photo || bestPhoto(realPhotos(r));
    if (p) return { kind: 'img', src: p.thumb || p.src, srcset: p.srcset, hotlink: !!p.hotlink, credit: `Photo: ${p.credit || ''}` };
    if (r.heroImage && r.heroImage.url) return { kind: 'img', src: r.heroImage.url, hotlink: true, credit: `Photo: ${hostOf(r.heroImage.source)}` };
    if (forCard && !igCardsOn()) return null;
    const posts = igPostsOf(r);
    if (posts.length) return igPostCard(r, bestPost(posts));
    if (r.igEmbed) return { kind: 'igprofile', embed: `https://www.instagram.com/${r.igHandle}/embed/`, href: `https://www.instagram.com/${r.igHandle}/`, credit: `Photos: @${r.igHandle} on Instagram` };
    return null;
  }
  /* Instagram on list cards: on unless config says no, Data Saver is on, or the connection is slow */
  function igCardsOn() {
    if ((window.TG_CONFIG || {}).igCardEmbeds === false) return false;
    const c = navigator.connection; return !(c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || '')));
  }
  /* scale + clip an Instagram embed iframe (540 px wide layout) so its photo covers a W×H box.
     post embed: 54 px header, then the 4:5 photo (540×675). profile embed: header ≈ 137–182 px, then a 3-column grid of 179 px
     tiles; we show the centre of the first tile (x 0–179, y 182–312 is inside it for every header height we measured). */
  function fitIg(box, fr, kind) {
    const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
    let k, x, y;
    if (kind === 'igprofile') { k = Math.max(W / 179, H / 130); x = W / 2 - 89.5 * k; y = H / 2 - 247 * k; fr.style.height = '700px'; }
    else { k = Math.max(W / 540, H / 675); x = (W - 540 * k) / 2; y = (H - 675 * k) / 2 - 54 * k; fr.style.height = (54 + 675 + 260) + 'px'; }
    fr.style.width = '540px'; fr.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  }
  /* list cards: Instagram iframes are created only when the card scrolls into view, max 3 loading at once */
  let igIO = null; const igQ = []; let igBusy = 0;
  function igPump() {
    while (igBusy < 3 && igQ.length) {
      const box = igQ.shift(); if (!box.isConnected || box.querySelector('iframe')) continue;
      igBusy++; const fr = document.createElement('iframe');
      fr.title = ''; fr.tabIndex = -1; fr.setAttribute('scrolling', 'no'); fr.setAttribute('aria-hidden', 'true'); fr.loading = 'lazy';
      let done = false; const fin = () => { if (done) return; done = true; igBusy--; box.classList.add('is-loaded'); igPump(); };
      fr.addEventListener('load', () => setTimeout(fin, 400)); setTimeout(fin, 8000);
      fr.src = box.dataset.igSrc; box.appendChild(fr); fitIg(box, fr, box.dataset.igKind);
    }
  }
  function lazyIg(root = document) {
    const boxes = [...root.querySelectorAll('.thumb-ig[data-ig-src]:not([data-ig-seen])')]; if (!boxes.length) return;
    if (!('IntersectionObserver' in window)) { boxes.forEach(b => { b.dataset.igSeen = 1; igQ.push(b); }); igPump(); return; }
    // only after the card has been on screen for 0.3 s (scrolling past quickly loads nothing)
    igIO = igIO || new IntersectionObserver(en => en.forEach(e => { const b = e.target;
      if (!e.isIntersecting) { clearTimeout(b._igT); return; }
      b._igT = setTimeout(() => { igIO.unobserve(b); igQ.push(b); igPump(); }, 300); }), { rootMargin: '0px' });
    boxes.forEach(b => { b.dataset.igSeen = 1; igIO.observe(b); });
  }
  /* pill thumbnail: the place's real photo (cardPhoto) over a typographic monogram (dark grain, Didone initial, gold on hover).
     The monogram is always underneath, so a broken hotlink or an embed that does not load falls back to it by itself. */
  function thumb(r, sizes = '80px') {
    const ini = initials(r.name);
    const tone = TYPE_KEY[r.type] || (r.group && r.group !== 'restaurants' ? r.group : 'interior');
    let h = 0; for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const mono = `<span class="mono-thumb grain mt-${tone}${ini.length > 1 ? ' two' : ''}" style="--ang:${h % 360}deg;--pos:${20 + h % 60}%" aria-hidden="true"><span>${esc(ini)}</span></span>`;
    const p = cardPhoto(r, true);
    if (!p) return mono;
    if (p.kind === 'img') return mono + `<img class="bw thumb-photo" src="${esc(p.src)}" ${p.srcset ? `srcset="${esc(p.srcset)}" sizes="${sizes}"` : ''}${p.hotlink ? ' referrerpolicy="no-referrer"' : ''} alt="" title="${esc(p.credit)}" loading="lazy" decoding="async" onerror="this.remove()">`;
    return mono + `<span class="bw thumb-ig" data-ig-src="${esc(p.embed)}" data-ig-kind="${p.kind}" title="${esc(p.credit)}" aria-hidden="true"></span>`;
  }
  const GROUP_LABEL = { restaurants: 'Restaurants', cafes_bars: 'Cafés & bars', coffee: 'Coffee', bakeries: 'Bakeries' };
  const CAT_LABEL = { 'fine dining': 'Fine dining', 'gastro-bistro': 'Gastro-bistro', 'bistro': 'Bistro', 'brasserie': 'Brasserie', 'casual': 'Casual', restaurant: 'Restaurant',
    quick_bites: 'Quick bites', dance_cafe: 'Dance café', brown_cafe: 'Brown café', irish_pub: 'Irish pub', cafe: 'Café', cocktail_bar: 'Cocktail bar', wine_bar: 'Wine bar', beer_bar: 'Beer bar',
    coffee_bar: 'Specialty coffee', coffee_house: 'Coffee house', coffee_shop: 'Coffee shop / roaster', bakery: 'Bakery', patisserie: 'Patisserie' };
  /* veggie/vegan level (data/cities/<city>-veggie.json): fully vegan › fully vegetarian › clear vegan options › clear veggie options */
  const VEG_LABEL = { vegan: '100% vegan', vegetarian: '100% vegetarian', 'vegan-friendly': 'Vegan options', 'veggie-friendly': 'Veggie options' };
  const VEG_SHORT = { vegan: 'Vegan', vegetarian: 'Vegetarian', 'vegan-friendly': 'Vegan options', 'veggie-friendly': 'Veggie options' };
  const catLabel = r => CAT_LABEL[r.category] || CAT_LABEL[r.type] || GROUP_LABEL[r.group] || '';
  const TYPE_LABEL = { 'fine dining': 'Fine dining', 'gastro-bistro': 'Gastro-bistro', 'bistro': 'Bistro', 'brasserie': 'Brasserie', 'casual': 'Casual' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const known = v => v != null && v !== '' && v !== U && !/^unknown\b/i.test(String(v));
  const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!iso || iso === U) return U;
    const parts = String(iso).split('-');
    if (parts.length === 1) return iso;
    if (parts.length === 2) return new Date(+parts[0], +parts[1] - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    return new Date(iso + 'T12:00:00').toLocaleDateString(LOCALE, opts);
  };
  const eur = n => '€' + (Number.isInteger(+n) ? n : (+n).toFixed(2));
  const priceNum = p => ({ '€': 1, '€€': 2, '€€€': 3, '€€€€': 4 }[p] || null);
  const isStar = m => /Michelin stars?$/.test(m || '');
  const distRank = r => {
    const m = r.distinctions.michelin; let s = 0;
    if (m === '2 Michelin stars') s = 300; else if (m === '1 Michelin star') s = 200; else if (m === 'Bib Gourmand') s = 120; else if (m === 'Michelin selection') s = 100;
    return s + (r.distinctions.gaultMillau || 0);
  };
  const stars = m => m === '2 Michelin stars' ? '★★' : m === '1 Michelin star' ? '★' : m === 'Bib Gourmand' ? 'Bib' : m === 'Michelin selection' ? 'Michelin' : '';
  /* next occurrence for rule-based events, e.g. {freq:'monthly', nth:2, weekday:6} = every 2nd Saturday */
  function nextOccurrence(rule, from = TODAY) {
    if (!rule || rule.freq !== 'monthly') return null;
    let [y, m] = from.split('-').map(Number);
    for (let i = 0; i < 14; i++) {
      const first = new Date(Date.UTC(y, m - 1, 1)); const off = (rule.weekday - first.getUTCDay() + 7) % 7;
      const d = new Date(Date.UTC(y, m - 1, 1 + off + 7 * (rule.nth - 1)));
      const iso = d.toISOString().slice(0, 10);
      if (d.getUTCMonth() === m - 1 && iso >= from) return iso;
      m++; if (m > 12) { m = 1; y++; }
    }
    return null;
  }
  /* normalise an event to its relevant (next) occurrence; returns null if it is in the past or undated */
  function liveEvent(e) {
    if (e.recurrence) { const n = nextOccurrence(e.recurrence); return n && (!e.recurrence.until || n <= e.recurrence.until) ? { ...e, dateStart: n, dateEnd: null } : null; }
    if (!e.dateStart) return e.ongoing && e.dateEnd && e.dateEnd >= TODAY ? e : null;
    return (e.dateEnd || e.dateStart) >= TODAY ? e : null;
  }
  const isUpcoming = e => !!liveEvent(e);
  /* priority order; cards pass {max: 2} */
  function badges(r, { withDist = true, max = 99, noVeg = false } = {}) {
    const b = [];
    if (r.status !== 'open') b.push(`<span class="badge">${esc(r.status)}</span>`);
    if (r.upcoming) b.push(`<span class="badge soon">${esc(soonLabel(r))}</span>`);
    else if (r.isNew) b.push(`<span class="badge solid new">${esc(newLabel(r))}</span>`);
    if (r.events.length) b.push('<span class="badge solid">Event</span>');
    if (r.veggieLevel && !noVeg) b.push(`<span class="badge veg lv-${r.veggieLevel}" title="${esc(VEG_LABEL[r.veggieLevel])}">${esc(VEG_SHORT[r.veggieLevel])}</span>`);
    if (withDist && r.distinctions.michelin && r.distinctions.michelin !== 'Michelin selection') b.push(`<span class="badge dist">${esc(stars(r.distinctions.michelin))}</span>`);
    if (withDist && r.distinctions.gaultMillau) b.push(`<span class="badge dist">G&amp;M ${r.distinctions.gaultMillau}</span>`);
    return b.slice(0, max).join('');
  }

  /* ---- upcoming openings (data/cities/<city>-upcoming.json) ----
     expectedOpening: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' | 'soon'. Once that day (or the whole month/year) has passed in
     Europe/Brussels, the place is shown as "Just opened" until it is moved into <city>.json by hand (see update.md). */
  function expectedPassed(x) {
    const v = String(x || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v <= TODAY;
    if (/^\d{4}-\d{2}$/.test(v)) return TODAY.slice(0, 7) > v;
    if (/^\d{4}$/.test(v)) return TODAY.slice(0, 4) > v;
    return false;                                                      // 'soon' / unknown: stays upcoming
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function expectedText(r, long = false) {
    const v = String(r.expectedOpening || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return long ? fmtDate(v, { day: 'numeric', month: 'long', year: 'numeric' }) : `${+v.slice(8)} ${MON[+v.slice(5, 7) - 1]}`;
    if (/^\d{4}-\d{2}$/.test(v)) return long ? fmtDate(v) : MON[+v.slice(5, 7) - 1];
    if (r.expectedOpeningLabel) return r.expectedOpeningLabel;
    return /^\d{4}$/.test(v) ? v : '';
  }
  /* card label: 'Opening soon · December' (month only within the next 3 months, else 'December 2027'; year-only stays '2027') */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function soonText(r) {
    const v = String(r.expectedOpening || ''), m = v.match(/^(\d{4})-(\d{2})/);
    if (m) { const ahead = (+m[1] * 12 + +m[2]) - (+TODAY.slice(0, 4) * 12 + +TODAY.slice(5, 7)); return MONTHS[+m[2] - 1] + (ahead > 3 || ahead < 0 ? ' ' + m[1] : ''); }
    if (r.expectedOpeningLabel) return r.expectedOpeningLabel;
    return /^\d{4}$/.test(v) ? v : '';
  }
  const soonLabel = r => { const t = soonText(r); return t ? `Opening soon · ${t}` : 'Opening soon'; };
  /* 'New' = opened less than 12 months before today (Europe/Brussels), computed here, never stored.
     opened: 'YYYY-MM' | 'YYYY-MM-DD' (field `opened`; else a leading YYYY-MM[-DD] in openingDate). No month known → not New. */
  const openedOf = r => { const m = String(r.opened || (known(r.openingDate) ? r.openingDate : '')).match(/^\d{4}-\d{2}(-\d{2})?/); return m && +m[0].slice(5, 7) >= 1 && +m[0].slice(5, 7) <= 12 ? m[0] : null; };
  const NEW_CUTOFF = (+TODAY.slice(0, 4) - 1) + TODAY.slice(4);                 // same day, one year ago
  const isRecent = o => { if (!o) return false; const d = o.length === 7 ? o + '-01' : o; return d > NEW_CUTOFF && d <= TODAY; };
  const newLabel = r => r.opened ? `New since ${MONTHS[+r.opened.slice(5, 7) - 1]} ${r.opened.slice(0, 4)}` : 'New';
  /* shape an upcoming record like a normal place record (defaults for every field the UI reads) */
  function fromUpcoming(u) {
    u = { ...u, expectedOpening: u.opening || u.expectedOpening };      // `opening: 'YYYY-MM'` and the older `expectedOpening` mean the same
    const passed = expectedPassed(u.expectedOpening);
    return {
      type: null, cuisine: '', cuisineTags: [], chef: u.team || 'unknown', priceLevel: 'unknown', priceFrom: null, phone: null,
      distinctions: { michelin: null, gaultMillau: null }, events: [], photos: [], instagram_posts: [], menuType: 'unknown', menuChanges: 'unknown',
      currentMenuNote: 'unknown', reservation_url: null, status: 'open', statusNote: '', dataConflict: null, vegetarian: 'unknown', vegan: 'unknown',
      ...u,
      features: { ...(u.features || {}) }, features_evidence: { ...(u.features_evidence || {}) },
      instagram: u.instagram_handle ? `https://www.instagram.com/${u.instagram_handle}/` : null,
      summary: u.description, summaryLang: 'en', lastChanged: u.dateChecked, district: u.district || '', neighbourhood: u.neighbourhood || '',
      fromUpcoming: true, upcoming: !passed, isNew: false,                // once the month has passed: 'New since <month>' (computed in load)
      opened: passed && /^\d{4}-\d{2}/.test(u.expectedOpening) ? u.expectedOpening : null,
      openingDate: passed ? (u.expectedOpening || 'unknown') : 'unknown', openingYear: passed ? String(u.expectedOpening).slice(0, 4) : 'unknown'
    };
  }

  /* shape an OpenStreetMap record (data/cities/<city>-osm.json) like a place record; never invents content */
  function fromOsm(o) {
    return {
      type: null, cuisine: (o.cuisineTags || []).join(', '), cuisineTags: o.cuisineTags || [], chef: 'unknown', priceLevel: 'unknown', priceFrom: null, phone: null,
      distinctions: { michelin: null, gaultMillau: null }, events: [], photos: [], instagram_posts: [], menuType: 'unknown', menuChanges: 'unknown',
      currentMenuNote: 'unknown', reservation_url: null, status: 'open', statusNote: '', dataConflict: null, vegetarian: 'unknown', vegan: 'unknown',
      openingYear: 'unknown', openingDate: 'unknown', isNew: false, summary: '', summaryLang: 'en', district: '', neighbourhood: '', address: 'unknown',
      ...o, address: o.address || 'unknown',
      instagram: o.instagram_handle ? `https://www.instagram.com/${o.instagram_handle}/` : null,
      geoSource: 'OpenStreetMap', openingHoursSource: o.openingHoursSource || (o.openingHours ? 'OpenStreetMap' : null),
      sources: [`https://www.openstreetmap.org/${o.osm}`], fromOsm: true, curated: false,
      features: { ...(o.features || {}) }, features_evidence: { ...(o.features_evidence || {}) }
    };
  }
  /* tag layer (data/cities/<city>-tags.json, sourced): adds cuisine tags to a place without a usable one and fills features that are
     still null; never overrides curated or OSM values */
  function applyTags(r, t) {
    if (!t) return;
    if ((t.cuisineTags || []).length) { r.cuisineTags = [...new Set([...(r.cuisineTags || []), ...t.cuisineTags])]; if (!r.cuisine) r.cuisine = t.cuisineTags.join(', '); r.cuisineInfo = t; }
    if (t.features) { r.features = { ...(r.features || {}) }; r.features_evidence = { ...(r.features_evidence || {}) };
      Object.entries(t.features).forEach(([k, v]) => { if (r.features[k] == null) { r.features[k] = v; r.features_evidence[k] = (t.features_evidence || {})[k] || 'OpenStreetMap'; } }); }
  }
  /* apply the veggie layer: one level per place, sourced; curated diet fields without a layer entry map to *-friendly */
  function applyVeg(r, v) {
    if (v) { r.veggieLevel = v.veggieLevel; r.veggieInfo = v; }
    else if (!r.veggieLevel && r.vegan === 'yes') r.veggieLevel = 'vegan-friendly';
    else if (!r.veggieLevel && r.vegetarian === 'yes') r.veggieLevel = 'veggie-friendly';
    const L = r.veggieLevel; if (!L) return;
    r.vegetarian = 'yes'; r.vegan = L === 'vegan' || L === 'vegan-friendly' ? 'yes' : (L === 'vegetarian' || L === 'veggie-friendly') && r.vegan === 'yes' ? 'unknown' : r.vegan;
    const why = v ? `${VEG_LABEL[L]} — ${v.note || v.basis}` : `${VEG_LABEL[L]} — ${r.dietNote || 'see sources'}`;
    r.features = { ...(r.features || {}) }; r.features_evidence = { ...(r.features_evidence || {}) };
    if (r.group === 'restaurants') { r.features.veggie = true; r.features_evidence.veggie = why; }
    if (r.vegan === 'yes') { r.features.vegan = true; r.features_evidence.vegan = why; } else if (r.features.vegan === true && v) { r.features.vegan = null; delete r.features_evidence.vegan; }
  }

  /* earliest opening time from the sourced opening-hours text (OSM syntax "Mo-Fr 07:30-18:00; Sa 08:00-12:00" or ours
     "Mon closed · Tue–Sat 08:00–15:00"). Returns { time: '07:30', mins, days: 'Mo-Fr' } or null. Starts before 05:00 are
     night-time continuations (bars), not openings. This is a FACT about hours, never a claim that breakfast is served. */
  function openFrom(r) {
    const h = r.openingHours; if (!h || !known(h) || /24\/7/.test(h)) return null;
    let best = null;
    String(h).split(/;|·|\|/).forEach(seg => {
      const m = seg.match(/(\d{1,2})[:.h](\d{2})\s*[-–]/); if (!m) return;
      const mins = +m[1] * 60 + +m[2]; if (mins < 300 || mins >= 1440) return;
      if (!best || mins < best.mins) best = { mins, time: `${m[1].padStart(2, '0')}:${m[2]}`, days: seg.slice(0, m.index).replace(/[,:\s]+$/, '').trim() };
    });
    return best;
  }
  /* ---- open now (js/hours.js, Europe/Brussels) ----
     open | closed | unknown. A place with a non-open status (temporarily closed, renovation…) is never open. Hours that cannot be
     parsed with confidence, or that carry a "sources differ" note, are unknown: nothing is shown and they sort between open and closed. */
  function openState(r, now = new Date()) {
    if (r.upcoming) return { state: 'unknown' };
    if (r.status && r.status !== 'open') return { state: 'closed', byStatus: true };
    if (r.openingHoursNote || !known(r.openingHours) || !window.TGHours) return { state: 'unknown' };
    return window.TGHours.status(r.openingHours, now);
  }
  const OPEN_RANK = { open: 0, unknown: 1, closed: 2 };
  /* small label: list cards (short) and the detail page (long: "Closed · opens Tue 08:00"); empty for unknown / status-closed */
  function openLabel(o, long = false) {
    if (!o || o.byStatus) return '';
    if (o.state === 'open') return `<span class="oh oh--open">Open now${long && o.closesAt ? `<span class="oh__sub"> · until ${esc(o.closesAt)}</span>` : ''}</span>`;
    if (o.state !== 'closed') return '';
    const t = o.opensAt ? window.TGHours.opensText(o.opensAt) : '';
    return `<span class="oh oh--closed">${long ? `Closed${t ? ` · opens ${esc(t)}` : ''}` : t ? `Opens ${esc(t)}` : 'Closed'}</span>`;
  }
  const EARLY = 600;                                                  // "Open early" = opens at or before 10:00
  const BF_GROUPS = new Set(['restaurants', 'coffee', 'cafes_bars']);
  /* breakfast / brunch: confirmed (sourced) vs. merely opening early (heuristic, shown separately) */
  function mealOf(r) {
    const F = r.features || {};
    const bf = F.breakfast === true, br = F.brunch === true;
    const days = r.brunchDays || '';
    const wk = br && /weekend|sat|sun|\bza|\bzo|\bsa\b|\bsu\b/i.test(days) && !/mon|tue|wed|thu|fri|daily|every day|dagelijks|\bma\b|\bdi\b|\bwo\b|\bdo\b|\bvr\b|mo-|tu-|we-|th-|fr\b/i.test(days);
    const o = r._open === undefined ? (r._open = openFrom(r)) : r._open;
    const early = !bf && !br && !!o && o.mins <= EARLY && (BF_GROUPS.has(r.group) || (r.group === 'bakeries' && F.seating === true));
    return { bf, br, wk, any: bf || br, early, open: o };
  }

  /* breakfast layer (data/cities/<city>-breakfast.json, sourced): fills features.breakfast / brunch + evidence; never overrides curated values */
  function applyMeal(r, b) {
    if (!b) return;
    r.features = { ...(r.features || {}) }; r.features_evidence = { ...(r.features_evidence || {}) };
    ['breakfast', 'brunch'].forEach(k => { const x = b[k]; if (!x || r.features[k] != null) return;
      r.features[k] = x.value; r.features_evidence[k] = [x.note, x.source && x.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]].filter(Boolean).join(' · '); });
    if (b.brunchDays && b.brunchDays.value) r.brunchDays = b.brunchDays.value;
    if (b.breakfastHours && b.breakfastHours.value) r.breakfastHours = b.breakfastHours.value;
    r.mealSources = [b.breakfast, b.brunch, b.brunchDays, b.breakfastHours].filter(x => x && x.source).map(x => x.source);
  }

  /* "At a glance" feature tiles (group-specific), shared by the detail grid and the list cards.
     Values: true (sourced) | false | null; events/chefCollabs come from upcoming events. */
  function featureTiles(r) {
    const isR = r.group === 'restaurants';
    const F = Object.assign({}, r.features || {});
    const live = r.events || [];
    F.events = live.length ? true : null;
    F.chefCollabs = live.some(e => /collab|four.hands|4.hands|guest chef|chef collective/i.test(`${e.type} ${e.title}`) || (e.partners || []).length) ? true : null;
    const EV = Object.assign({}, r.features_evidence || {});
    if (F.events) EV.events = `${live.length} upcoming`;
    if (F.chefCollabs) EV.chefCollabs = 'upcoming event with partner chefs';
    const TILES_BY_GROUP = {
      cafes_bars: [['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['liveMusic', 'Live music'], ['dj', 'DJ'], ['terrace', 'Terrace'], ['foodServed', 'Food served'], ['wifi', 'Wifi'], ['wheelchair', 'Wheelchair accessible'], ['openMonday', 'Open Monday'], ['openSunday', 'Open Sunday'], ['events', 'Events'], ['new', 'New']],
      coffee: [['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['vegan', 'Vegan options'], ['glutenFree', 'Gluten-free'], ['seating', 'Seating'], ['terrace', 'Terrace'], ['wifi', 'Wifi'], ['takeaway', 'Takeaway'], ['wheelchair', 'Wheelchair accessible'], ['openMonday', 'Open Monday'], ['openSunday', 'Open Sunday'], ['new', 'New']],
    };
    TILES_BY_GROUP.bakeries = TILES_BY_GROUP.coffee;
    if (r.category === 'cocktail_bar') TILES_BY_GROUP.cafes_bars = [['terrace', 'Terrace'], ['signatureCocktails', 'Signature cocktails'], ['mocktails', 'Mocktails / alcohol-free'],
      ['foodServed', 'Food served'], ['lateNight', 'Late night'], ['openSunday', 'Open Sunday'], ['reservations', 'Reservations']];
    if (!isR) F.new = r.isNew ? true : null;
    const TILES = TILES_BY_GROUP[r.group] || [['veggie', 'Veggie'], ['vegan', 'Vegan'], ['glutenFree', 'Gluten-free options'], ['kidsWelcome', 'Kids welcome'], ['terrace', 'Terrace'],
      ['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['setMenu', 'Set menu'], ['aLaCarte', 'À la carte'], ['winePairing', 'Wine pairing'], ['naPairing', 'Non-alcoholic pairing'],
      ['michelin', 'Michelin'], ['gaultMillau', 'Gault&Millau'], ['events', 'Events'], ['chefCollabs', 'Chef collabs'], ['reservations', 'Reservations'],
      ['walkIn', 'Walk-in'], ['takeaway', 'Takeaway'], ['wheelchair', 'Wheelchair accessible'], ['openMonday', 'Open Monday'], ['openSunday', 'Open Sunday'], ['new', 'New']];
    return { F, EV, TILES };
  }

  /* Google Maps directions (new tab). Destination = name + address (+ the current city); lat,lng if no address; place_id only when we have a real one */
  function directionsUrl(r) {
    const clean = t => String(t || '').replace(/\s*\([^)]*\)/g, '').trim();   // drop notes like "(former Club 69)"
    const addr = known(r.address) ? clean(r.address) : '', name = clean(r.name);
    const cn = (CUR && CUR.name) || '', cre = new RegExp([cn, CUR && CUR.nameEn].filter(Boolean).join('|') || '^$', 'i');
    const dest = addr ? `${name}, ${addr}${!cn || cre.test(addr) ? '' : ', ' + cn}` : (r.lat ? `${r.lat},${r.lng}` : `${name}${cn ? ', ' + cn : ''}`);
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + (r.google_place_id ? '&destination_place_id=' + encodeURIComponent(r.google_place_id) : '');
  }

  /* ---- countries & cities ---- */
  let CITIES = null;
  async function cities() {
    if (!CITIES) CITIES = await fetch(bust('data/cities.json'), { cache: 'no-cache' }).then(r => r.json());
    return CITIES;
  }
  function allCities(cfg) { return cfg.countries.flatMap(c => c.cities.map(x => ({ ...x, country: c.name, countryCode: c.code, countryId: c.id }))); }
  /* resolve ?country=…&city=…; unknown or inactive places fall back to the default with a notice */
  async function currentCity() {
    const cfg = await cities(); const list = allCities(cfg);
    const qs = new URLSearchParams(location.search);
    const askedCountry = (qs.get('country') || '').toLowerCase();
    const askedCity = (qs.get('city') || '').toLowerCase();
    const def = list.find(c => c.id === cfg.defaultCity);
    const co = cfg.countries.find(c => c.id === askedCountry);
    let city = def, notice = '';
    if (askedCountry && !co) notice = `Unknown country “${askedCountry}” — showing ${def.name}, ${def.country}.`;
    else if (co && !co.active) notice = `${co.name} is coming soon — showing ${def.name}, ${def.country}.`;
    else {
      const pool = co ? list.filter(c => c.countryId === co.id) : list;
      const hit = askedCity ? pool.find(c => c.id === askedCity) : pool.find(c => c.active);
      if (hit && hit.active) city = hit;
      else if (hit) notice = `${hit.name} is coming soon — showing ${def.name}.`;
      else if (askedCity) notice = `Unknown city “${askedCity}” — showing ${def.name}.`;
    }
    const country = cfg.countries.find(c => c.id === city.countryId);
    return { cfg, city, country, notice };
  }
  let CUR = null;
  const cityUrl = (page, cityId, extra = '') => {
    const c = CUR && CUR.id === cityId ? CUR : (CITIES ? allCities(CITIES).find(x => x.id === cityId) : null);
    return `${page}?country=${encodeURIComponent(c ? c.countryId : 'be')}&city=${encodeURIComponent(cityId)}${extra}`;
  };
  /* two pills: Country ▾  City ▾ (city list filtered by the chosen country) */
  function renderCitySel(cfg, city) {
    CUR = city; try { localStorage.setItem('tatc.lastCity', city.id); } catch (e) {}   // the landing (index.html, site root) offers 'Continue to <city>'
    const cityItems = co => co.cities.map(c => c.active
      ? `<li role="option" aria-current="${c.id === city.id}"><a class="ci" href="${cityUrl('guide.html', c.id)}">${esc(c.name)}<em>${c.id === city.id ? '●' : ''}</em></a></li>`
      : `<li role="option" aria-disabled="true"><span class="ci soon">${esc(c.name)}<em>soon</em></span></li>`).join('');
    document.querySelectorAll('[data-citysel]').forEach(el => {
      el.classList.add('placesel');
      el.innerHTML = `
        <div class="citysel" data-dd="country"><button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose country">${esc(city.country)}</button>
          <ul role="listbox">${cfg.countries.map(co => co.active
            ? `<li role="option" aria-current="${co.id === city.countryId}"><button type="button" class="ci" data-country="${esc(co.id)}">${esc(co.name)}<em>${co.id === city.countryId ? '●' : ''}</em></button></li>`
            : `<li role="option"><button type="button" class="ci soon" data-soon="${esc(co.name)}" aria-label="${esc(co.name)}, coming soon">${esc(co.name)}<em>soon</em></button></li>`).join('')}
            <li class="soon-msg" hidden></li><li class="world"><a class="ci" href="./">All destinations · globe<em>↗</em></a></li></ul></div>
        <div class="citysel" data-dd="city"><button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose city">${esc(city.name)}</button>
          <ul role="listbox"><li class="grp">${esc(city.country)}</li>${cityItems(cfg.countries.find(c => c.id === city.countryId))}</ul></div>`;
      el.querySelectorAll('.citysel').forEach(dd => {
        const btn = dd.querySelector(':scope>button');
        btn.addEventListener('click', e => { e.stopPropagation(); el.querySelectorAll('.citysel').forEach(o => o !== dd && o.classList.remove('open'));
          const o = dd.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
        dd.querySelector('ul').addEventListener('click', e => e.stopPropagation());
      });
      el.querySelectorAll('[data-soon]').forEach(b => b.addEventListener('click', () => {
        const m = el.querySelector('.soon-msg'); m.hidden = false; m.textContent = `${b.dataset.soon} — coming soon`; }));
      el.querySelectorAll('[data-country]').forEach(b => b.addEventListener('click', () => {
        const co = cfg.countries.find(c => c.id === b.dataset.country);
        const ddc = el.querySelector('[data-dd="city"]'); el.querySelector('[data-dd="country"]').classList.remove('open');
        ddc.querySelector('ul').innerHTML = `<li class="grp">${esc(co.name)}</li>` + cityItems(co); ddc.classList.add('open');
      }));
    });
    document.addEventListener('click', () => document.querySelectorAll('.citysel.open').forEach(d => { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', 'false'); }));
    document.querySelectorAll('[data-home]').forEach(a => a.href = cityUrl('guide.html', city.id) + (a.dataset.home || ''));
  }
  /* cuisine groups for the quiz's 'What kind of food?' step and the 'By cuisine' card. `t` is tested on each cuisine tag
     (OSM + curated), `x` (optional) on the curated free-text cuisine line (curated tags are coarse, e.g. Thai → 'Asian').
     Only restaurants count; groups with fewer than 3 places are not offered (see cuisineList). The alternatives after the first ones are
     synonyms (e.g. Portuguese → Mediterranean, Pakistani / Tibetan → Indian & Nepalese, Modern French → French); missing cuisines come from
     the sourced tag layer data/cities/<city>-tags.json (applyTags) */
  const CUISINES = [
    { id: 'belgian', label: 'Belgian & Flemish', t: /^(belgian|belgian \/ flemish|flemish|regional|belgian classics|flemish classics|traditional belgian)$/i, x: /\b(belgian|flemish)\b/i },
    { id: 'french', label: 'French', t: /^(french|modern french|classic french|french contemporary|creative french|french market cuisine)$/i },
    { id: 'italian', label: 'Italian & pizza', t: /^(italian|italian pizza|pizza|pasta|spaghetti)$/i, x: /\b(italian|sicilian|tuscan)\b/i },
    { id: 'mediterranean', label: 'Spanish & Mediterranean', t: /^(spanish|tapas|mediterranean|greek|spanish \/ mediterranean|portuguese|italian \/ mediterranean)$/i },
    { id: 'modern', label: 'Modern & creative', t: /^(modern \/ creative|modern|modern cuisine|creative|contemporary|bistronomy|fine dining|gastronomic)$/i },
    { id: 'japanese', label: 'Japanese & sushi', t: /^(japanese|sushi|ramen)$/i, x: /\b(japanese|omakase)\b/i },
    { id: 'chinese', label: 'Chinese', t: /^(chinese|dumplings|hot pot|cantonese|sichuan|szechuan|taiwanese|hong kong)$/i },
    { id: 'thai', label: 'Thai', t: /^thai$/i, x: /\bthai\b/i },
    { id: 'vietnamese', label: 'Vietnamese', t: /^vietnamese$/i },
    { id: 'korean', label: 'Korean', t: /^(korean|contemporary korean)$/i },
    { id: 'asian', label: 'Other Asian', t: /^(asian|asian fusion|filipino|noodles|poke|hawaiian|poke bowl|indonesian|malaysian|singaporean|southeast asian|pan-asian)$/i },
    { id: 'indian', label: 'Indian & Nepalese', t: /^(indian|nepalese|pakistani|tibetan|sri lankan|bangladeshi)$/i },
    { id: 'turkish', label: 'Turkish & kebab', t: /^(turkish|kebab|döner|pita)$/i },
    { id: 'middle-eastern', label: 'Middle Eastern', t: /^(middle eastern|syrian|lebanese|palestinian|persian|arab|arabic|oriental|falafel|afghan|iranian|israeli|kurdish)$/i },
    { id: 'north-african', label: 'Moroccan & North African', t: /^(moroccan|maroccan|libyan|tunisian|algerian|north african)$/i },
    { id: 'african', label: 'African', t: /^(african|ethiopian|cameroonian|malagasy|senegalese|congolese|eritrean|cape verdean|west african)$/i },
    { id: 'latin', label: 'Mexican & Latin American', t: /^(mexican|latin american|peruvian|bolivian|empanadas?|brazilian|argentinian|colombian|venezuelan|chilean|tex-mex|cuban)$/i },
    { id: 'grill', label: 'Steak & grill', t: /^(steakhouse|grill|barbecue|spare ribs|fire \/ meat|steak|steaks|rotisserie)$/i },
    { id: 'fish', label: 'Fish & seafood', t: /^(seafood|fish|fish \/ north sea|fish and seafood|north sea|seafood restaurant|oysters)$/i },
    { id: 'lunch', label: 'Sandwiches & soup', title: 'Sandwich & soup spots', t: /^(sandwiches|soup|soep|salads|bagels|wrap|bowl)$/i }
  ];
  const ASIAN = ['japanese', 'chinese', 'thai', 'vietnamese', 'korean'];
  /* broad groups (30 Oct 2026): 'By cuisine' and the quiz's 'A specific cuisine' path offer these first; the detailed cuisines above are
     the sub-filter chips of a group (app.js czSub) and the quiz's adaptive second step. A group with one member is that cuisine itself.
     Group ids (and the older quiz family ids / 'asian-other', kept as aliases for saved links) also work as a ?cuisine= filter. */
  const CZ_GROUPS = [
    { id: 'g-europe', label: 'European', s: 'Belgian, French, Italian, Spanish, modern', members: ['belgian', 'french', 'italian', 'mediterranean', 'modern'] },
    { id: 'g-asia', label: 'Asian', s: 'Japanese, Chinese, Thai, Vietnamese, Indian…', members: ['japanese', 'chinese', 'thai', 'vietnamese', 'korean', 'asian', 'indian'] },
    { id: 'g-mena', label: 'Middle Eastern & North African', s: 'Lebanese, Turkish, Moroccan…', members: ['middle-eastern', 'turkish', 'north-african'] },
    { id: 'g-africa', label: 'African', s: 'Ethiopian, West & Central African', members: ['african'] },
    { id: 'g-latin', label: 'Latin American', s: 'Mexican, Peruvian, Brazilian…', members: ['latin'] },
    { id: 'g-grill', label: 'Fish, meat & grill', s: 'Seafood, steak, grill', members: ['fish', 'grill'] },
    { id: 'g-lunch', label: 'Quick bites', s: 'Sandwiches & soup', members: ['lunch'] }
  ];
  const CZ_FAMILIES = CZ_GROUPS;                                          // quiz name (js/quiz.js)
  const CZ_BY = Object.fromEntries(CUISINES.map(c => [c.id, c]));
  CZ_GROUPS.forEach(g => { CZ_BY[g.id] = { id: g.id, label: g.label, title: g.members.length === 1 && CZ_BY[g.members[0]].title || g.label + ' restaurants', group: true, members: g.members };
    g.members.forEach(m => { if (!CZ_BY[m].parent) CZ_BY[m].parent = g.id; }); });
  Object.entries({ 'asian-other': ['asian', 'korean'], 'fam-befr': ['belgian', 'french'], 'fam-itmed': ['italian', 'mediterranean'],
    'fam-asian': ['japanese', 'thai', 'chinese', 'vietnamese', 'asian', 'korean'], 'fam-east': ['indian', 'middle-eastern', 'turkish', 'north-african', 'african'],
    'fam-meat': ['grill', 'fish'] }).forEach(([id, members]) => { CZ_BY[id] = { id, label: id === 'asian-other' ? 'Other Asian' : id, members }; });
  const inCuisine = (r, id) => { const c = CZ_BY[id]; if (!c || r.group !== 'restaurants') return false;
    if (c.members) return c.members.some(m => inCuisine(r, m));
    if (!r._cz) r._cz = {}; if (id in r._cz) return r._cz[id];
    if (id === 'asian' && ASIAN.some(k => inCuisine(r, k))) return (r._cz[id] = false);   // 'Other Asian' = not already Japanese, Thai, …
    return (r._cz[id] = (r.cuisineTags || []).some(t => c.t.test(t)) || !!(c.x && r.curated && c.x.test(r.cuisine || ''))); };
  /* the offered list: groups with >= min open restaurants (announced places left out), in the order above, with counts */
  const hasCuisine = r => CUISINES.some(c => inCuisine(r, c.id));   // any known cuisine group (quiz: 'A specific cuisine')
  const czCount = (R, id) => R.filter(r => !r.upcoming && inCuisine(r, id)).length;
  /* 'By cuisine': the broad groups with >= min restaurants; czSubs(R, groupId): its detailed cuisines with >= 1 place */
  const cuisineList = (R, min = 3) => CZ_GROUPS.map(g => ({ ...CZ_BY[g.id], s: g.s, n: czCount(R, g.id) })).filter(c => c.n >= min);
  const czSubs = (R, gid) => ((CZ_BY[gid] && CZ_BY[gid].group && CZ_BY[gid].members) || []).map(m => ({ ...CZ_BY[m], n: czCount(R, m) })).filter(c => c.n > 0);
  /* small 0-10 score next to a name (Google rating x 2); nothing when there is no confident match */
  const scoreBadge = r => r && r.gscore ? `<span class="gscore" title="Google rating ${(r.gscore / 2).toFixed(1)}/5, shown out of 10" aria-label="Google rating ${r.gscore.toFixed(1)} out of 10">${r.gscore.toFixed(1)}</span>` : '';
  function renderFooter(cfg, city, extra = '') {
    const fam = cfg.brand.family.map(f => `<a href="https://${esc(f.domain)}" rel="noopener" title="${esc(f.domain)} – ${esc(f.status)}"><span class="wordmark"><span class="wm-main">${esc(f.name.split(' ')[0])}</span><span class="wm-sub">and the City</span></span></a> <span style="opacity:.6">(${esc(f.status)})</span>`).join(' · ');
    document.querySelectorAll('[data-footer]').forEach(el => el.innerHTML = `
      <a class="logo logo--foot" href="${cityUrl('guide.html', city.id)}"><img class="logo__img" src="img/brand/lockup-horizontal-white.svg" alt="Table and the City" width="162" height="34"></a>
      <div class="family">Part of the <i style="font-family:var(--serif-it);text-transform:none;font-size:15px;letter-spacing:.02em">… and the City</i> family<br>${fam}</div>
      <div class="foot-links"><a href="#suggest" class="foot-suggest" data-suggest>Suggest a place</a><a href="#top">Back to top ↑</a><a href="privacy.html" class="foot-privacy">Privacy</a></div>
      <div class="meta"><span>${esc(cfg.brand.domain)} · prototype</span><span>${esc(city.name)}, ${esc(city.country)}</span><span>${extra || 'Data: Michelin · Gault&amp;Millau · own websites · press'}</span><span>Base list: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL) · veggie levels: own checks + HappyCow</span><span>Ratings: Google</span><span class="visits" data-visits hidden></span></div>`);
  }

  /* ---- data ---- */
  async function load(city) {
    const opt = (url, empty) => url ? fetch(bust(url), { cache: 'no-cache' }).then(r => r.ok ? r.json() : empty).catch(() => empty) : Promise.resolve(empty);
    const [d, up, om, vg, hz, bk, ig, gr, ph, tg] = await Promise.all([fetch(bust(city.data), { cache: 'no-cache' }).then(r => r.json()), opt(city.upcoming, { upcoming: [] }), opt(city.osm, { places: [] }), opt(city.veggie, { places: {} }),
      opt(city.heroes, { places: {} }), opt(city.breakfast, { places: {} }), opt(city.instagram, { places: {}, embed: {} }), opt(city.ratings, { places: {} }), opt(city.photos, { places: {} }), opt(city.tags, { places: {} })]);
    const rs = d.restaurants.filter(r => r.status !== 'unverified');   // unverified records stay in the data, never shown
    rs.forEach(r => { r.curated = true; });                             // hand-curated records rank first
    const ids = new Set(rs.map(r => r.id));                            // once moved into <city>.json, that record wins
    rs.push(...(up.upcoming || []).filter(u => u.id && !ids.has(u.id)).map(fromUpcoming));
    rs.push(...(om.places || []).filter(o => !ids.has(o.id) && o.status !== 'closed').map(fromOsm));   // OpenStreetMap base list (deduped at import time)
    // a temporary status (e.g. closed for renovation / holidays) ends by itself: statusUntil = last closed day (Europe/Brussels), curated and OSM alike
    rs.forEach(r => { if (r.statusUntil && TODAY > r.statusUntil) { r.status = 'open'; r.statusNote = ''; } });
    rs.forEach(r => { r.opened = openedOf(r); r.isNew = !r.upcoming && isRecent(r.opened); });   // the stored isNew flag is ignored
    rs.forEach(r => applyTags(r, (tg.places || {})[r.id]));
    rs.forEach(r => applyVeg(r, (vg.places || {})[r.id]));
    rs.forEach(r => { const g = (gr.places || {})[r.id]; r.gscore = g && g.score > 0 ? g.score : null; });   // <city>-ratings.json: Google rating x 2 (0-10), only confident matches
    rs.forEach(r => { const h = (hz.places || {})[r.id]; if (h && !r.heroImage) r.heroImage = h; applyMeal(r, (bk.places || {})[r.id]); });
    /* Instagram / photo layer (<city>-instagram.json): researched handles (a rename wins), verified posts when a place has none,
       own-site og:image when there is no hero; igEmbed = the official profile embed renders the photo grid without a login */
    const IGP = ig.places || {}, EMB = ig.embed || {};
    rs.forEach(r => {
      const x = IGP[r.id];
      if (x) {
        if (x.instagram_handle) { r.instagram_handle = x.instagram_handle; r.instagram = `https://www.instagram.com/${x.instagram_handle}/`; }
        else if ('instagram_handle' in x) r.igUnconfirmed = true;
        if ((x.posts || []).length && !igPostsOf(r).length) r.instagram_posts = x.posts.map(p => typeof p === 'string' ? { url: p, category: '' } : p);   // reviewed posts carry a category
        if (x.heroReject && r.heroImage && r.heroImage.url === x.heroReject) delete r.heroImage;   // flagged by research: logo / text / render / chain promo / duplicate
        if (x.heroImage && !r.heroImage) r.heroImage = x.heroImage;
      }
      r.igHandle = r.instagram_handle || (r.instagram ? r.instagram.replace(/\/+$/, '').split('/').pop() : '');
      // the profile-grid embed shows whatever the place posted last (often people), so it is off unless config.igProfileEmbeds is true
      r.igEmbed = !!(CFG().igProfileEmbeds === true && r.igHandle && !r.igUnconfirmed && EMB[r.igHandle] && EMB[r.igHandle].ok);
    });
    /* photo research layer (<city>-photos.json, scripts/apply_photo_review.py): checked photos of food / drinks / the interior from the
       place's own website (hotlinked) and Instagram (official embed) go first, pick = card + hero; hold = only photos with people exist → none */
    const PH = ph.places || {};
    rs.forEach(r => {
      const x = PH[r.id]; if (!x) return;
      if (x.hold) { r.photoHold = x.hold; r.photos = []; r.google_photos = []; r.instagram_posts = []; delete r.heroImage; r.igEmbed = false; return; }
      const posts = (x.posts || []), seen = new Set(posts.map(p => p.url.replace(/\/$/, '')));
      r.photos = [...(x.photos || []), ...(r.photos || [])];
      r.instagram_posts = [...posts, ...igPostsOf(r).filter(p => !seen.has(p.url.replace(/\/$/, '')))];
      if (x.pick) r.photoPick = x.pick;
    });
    /* only upcoming events exist for the UI: past / undated ones are dropped here, everywhere */
    rs.forEach(r => { r.events = (r.events || []).map(liveEvent).filter(Boolean); });
    const events = [];
    rs.forEach(r => r.events.forEach(e => events.push({ ...e, restaurantIds: [r.id], restaurantNames: [r.name] })));
    const merged = {};
    events.forEach(e => { const k = e.title + '|' + (e.dateStart || e.dateText);
      if (merged[k]) { merged[k].restaurantIds.push(...e.restaurantIds); merged[k].restaurantNames.push(...e.restaurantNames); } else merged[k] = { ...e }; });
    const allEvents = Object.values(merged).concat((d.extraEvents || []).map(liveEvent).filter(Boolean).map(e => ({ ...e, restaurantIds: [], restaurantNames: [] })))
      .sort((a, b) => a.dateStart.localeCompare(b.dateStart) || (a.dateEnd || a.dateStart).localeCompare(b.dateEnd || b.dateStart));
    return { meta: d.city, restaurants: rs, events: allEvents, changelog: d.changelog || [] };
  }
  const haversine = (a, b) => { const R = 6371, t = x => x * Math.PI / 180; const dLat = t(b[0] - a[0]), dLng = t(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  function bindNav() {
    const nav = document.getElementById('nav'); if (!nav) return;
    document.querySelectorAll('[data-open-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.add('open'); nav.setAttribute('aria-hidden', 'false'); }));
    nav.querySelectorAll('[data-close-nav]').forEach(b => b.addEventListener('click', () => { nav.classList.remove('open'); nav.setAttribute('aria-hidden', 'true'); }));
  }
  /* ---- carousels: scroll-snap track + arrows + mouse drag with momentum (touch/trackpad scroll natively) ---- */
  const DRAG = new WeakMap();
  const wasDragged = el => { const d = DRAG.get(el); return !!(d && d.suppress); };
  function carousel(track) {
    if (!track || track._car) return; track._car = true;
    const id = track.id;
    const prev = document.querySelectorAll(`[data-car-prev="${id}"]`), next = document.querySelectorAll(`[data-car-next="${id}"]`);
    const step = () => Math.max(240, track.clientWidth * 0.8);
    const max = () => track.scrollWidth - track.clientWidth;
    function update() {
      const atStart = track.scrollLeft <= 2, atEnd = track.scrollLeft >= max() - 2, none = max() <= 2;
      prev.forEach(b => { b.disabled = atStart || none; b.setAttribute('aria-disabled', b.disabled); });
      next.forEach(b => { b.disabled = atEnd || none; b.setAttribute('aria-disabled', b.disabled); });
    }
    prev.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' })));
    next.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' })));
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    new ResizeObserver(update).observe(track);
    new MutationObserver(() => { track.scrollLeft = 0; update(); }).observe(track, { childList: true });
    track.addEventListener('keydown', e => {
      if (e.target !== track) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
    });
    /* vertical mouse wheel stays vertical page scroll; shift+wheel and trackpads scroll horizontally natively.
       Mouse drag: state is per gesture. A click is suppressed ONLY when the pointer of that same gesture moved
       > THRESH px between pointerdown and pointerup; every other path (arrows, wheel, touch, momentum) never
       blocks clicks. Pointer capture starts only after the threshold. Momentum never touches click state. */
    const THRESH = 6;
    const st = { id: null, down: false, moved: false, x0: 0, sl: 0, v: 0, t: 0, lx: 0, raf: 0, suppress: false };
    DRAG.set(track, st);
    const stopGlide = () => { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; track.classList.remove('dragging'); };
    const reset = () => {
      if (st.id != null) { try { if (track.hasPointerCapture(st.id)) track.releasePointerCapture(st.id); } catch (_) {} }
      st.id = null; st.down = false; st.moved = false;
    };
    track.addEventListener('pointerdown', e => {
      stopGlide(); reset(); st.suppress = false;                       // fresh gesture, nothing carried over
      if (e.pointerType !== 'mouse' || e.button !== 0) return;          // touch & pen use native swipe
      Object.assign(st, { id: e.pointerId, down: true, x0: e.clientX, sl: track.scrollLeft, v: 0, t: performance.now(), lx: e.clientX });
    });
    track.addEventListener('pointermove', e => {
      if (!st.down || e.pointerId !== st.id) return;
      if (!(e.buttons & 1)) { reset(); return; }                         // button released outside the window
      const dx = e.clientX - st.x0;
      if (!st.moved) {
        if (Math.abs(dx) <= THRESH) return;
        st.moved = true; track.classList.add('dragging');
        try { track.setPointerCapture(e.pointerId); } catch (_) {}
      }
      const now = performance.now(), dt = Math.max(1, now - st.t);
      st.v = 0.8 * st.v + 0.2 * ((st.lx - e.clientX) / dt); st.t = now; st.lx = e.clientX;
      track.scrollLeft = st.sl - dx; e.preventDefault();
    });
    track.addEventListener('pointerup', e => {
      if (e.pointerId !== st.id) return;
      const dragged = st.down && st.moved && Math.abs(e.clientX - st.x0) > THRESH;
      const v0 = st.v * 16; reset();
      st.suppress = dragged;                                             // only the click of THIS gesture
      if (dragged) setTimeout(() => { st.suppress = false; }, 0);        // click fires synchronously after pointerup
      if (!dragged) { track.classList.remove('dragging'); return; }
      let v = v0;
      const glide = () => {
        const before = track.scrollLeft;
        if (Math.abs(v) < 0.5) { stopGlide(); return; }
        track.scrollLeft += v; v *= 0.94;
        if (track.scrollLeft === before) { stopGlide(); return; }       // hit an edge
        st.raf = requestAnimationFrame(glide);
      };
      st.raf = requestAnimationFrame(glide);
    });
    const cancel = e => { if (e.pointerId === st.id) { reset(); stopGlide(); st.suppress = false; } };
    track.addEventListener('pointercancel', cancel);
    track.addEventListener('lostpointercapture', e => { if (e.pointerId === st.id && st.down) { reset(); stopGlide(); } });
    window.addEventListener('blur', () => { reset(); stopGlide(); });
    track.addEventListener('click', e => { if (st.suppress) { st.suppress = false; e.preventDefault(); e.stopPropagation(); } }, true);
    track.addEventListener('dragstart', e => e.preventDefault());
    update();
  }

  /* event boxes (city page + place page): one-line description, the event page as the box's link, 'More info' + optional 'Get tickets'.
     desc = e.desc if set (optional), else '<Type> at <venue>' from the event's own data (the full note stays as the box's tooltip) */
  const _evEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function evDesc(e) {
    if (e.desc) return e.desc;
    let at = (e.location || '').split(',')[0].trim(); if ((!at || /\d/.test(at)) && (e.partners || [])[0]) at = e.partners[0]; const ty = (e.type || 'event').trim();
    return `${ty[0].toUpperCase() + ty.slice(1)}${at ? ` at ${at}` : ''}`;
  }
  const evHref = e => (e.sources || []).find(s => s !== e.tickets) || e.tickets || (e.sources || [])[0] || '';
  const evButtons = e => { const h = evHref(e); return (h && h !== e.tickets ? `<a class="ev-btn" href="${_evEsc(h)}" target="_blank" rel="noopener">More info – visit the page ↗</a>` : '') +
    (e.tickets ? `<a class="ev-btn ev-btn--tix" href="${_evEsc(e.tickets)}" target="_blank" rel="noopener">Get tickets ↗</a>` : ''); };
  // optional picture in the box (e.image: { src, w, h, alt, credit, credit_url }) — a calm landscape image saved under img/events/; no image = box unchanged
  const evImg = e => { const m = e.image; if (!m || !m.src) return '';
    return `<figure class="ev__img"><img src="${_evEsc(m.src)}" width="${+m.w || 960}" height="${+m.h || 540}" loading="lazy" decoding="async" alt="${_evEsc(m.alt || '')}">${m.credit ? `<figcaption class="ev__credit">Photo: ${m.credit_url ? `<a href="${_evEsc(m.credit_url)}" target="_blank" rel="noopener">${_evEsc(m.credit)}</a>` : _evEsc(m.credit)}</figcaption>` : ''}</figure>`; };
  // the whole box opens the event page (links / buttons inside keep their own target)
  document.addEventListener('click', ev => { const b = ev.target.closest('[data-ev-href]'); if (!b || ev.target.closest('a, button') || (getSelection && String(getSelection()))) return;
    window.open(b.dataset.evHref, '_blank', 'noopener'); });
  return { CUISINES, CZ_BY, CZ_FAMILIES, CZ_GROUPS, czSubs, hasCuisine, evDesc, evHref, evButtons, evImg, inCuisine, cuisineList, scoreBadge, openState, openLabel, OPEN_RANK, openFrom, mealOf, VEG_LABEL, VEG_SHORT, directionsUrl, featureTiles, expectedPassed, expectedText, soonLabel, newLabel, MONTHS, GROUP_LABEL, CAT_LABEL, catLabel, realPhotos, bestPhoto, pickOf, initials, thumb, cardPhoto, fitIg, lazyIg, igPostsOf, bestPost, hostOf, carousel, wasDragged, BRAND, LOCALE, TODAY, U, TYPE_IMG, TYPE_KEY, imgAttrs, liveEvent, nextOccurrence, TYPE_LABEL, esc, known, fmtDate, eur, priceNum, isStar, distRank, stars, isUpcoming, badges,
    cities, currentCity, cityUrl, renderCitySel, renderFooter, load, haversine, bindNav };
})();
