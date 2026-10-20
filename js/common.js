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
  /* pill thumbnail: real photo if one exists, else a typographic monogram (dark grain, Didone initial, gold on hover) */
  function thumb(r, sizes = '80px') {
    const p = realPhotos(r).find(x => x.category === 'exterior' || x.category === 'interior') || realPhotos(r)[0];
    if (p) return `<img class="bw" src="${esc(p.thumb || p.src)}" ${p.srcset ? `srcset="${esc(p.srcset)}" sizes="${sizes}"` : ''} alt="" loading="lazy" decoding="async">`;
    const ini = initials(r.name);
    const tone = TYPE_KEY[r.type] || (r.group && r.group !== 'restaurants' ? r.group : 'interior');
    let h = 0; for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="mono-thumb grain mt-${tone}${ini.length > 1 ? ' two' : ''}" style="--ang:${h % 360}deg;--pos:${20 + h % 60}%" aria-hidden="true"><span>${esc(ini)}</span></span>`;
  }
  const GROUP_LABEL = { restaurants: 'Restaurants', cafes_bars: 'Cafés & bars', coffee: 'Coffee', bakeries: 'Bakeries' };
  const CAT_LABEL = { 'fine dining': 'Fine dining', 'gastro-bistro': 'Gastro-bistro', 'bistro': 'Bistro', 'brasserie': 'Brasserie', 'casual': 'Casual', restaurant: 'Restaurant',
    quick_bites: 'Quick bites', dance_cafe: 'Dance café', brown_cafe: 'Brown café', irish_pub: 'Irish pub', cafe: 'Café', cocktail_bar: 'Cocktail bar', beer_bar: 'Beer bar',
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
  function badges(r, { withDist = true, max = 99 } = {}) {
    const b = [];
    if (r.status !== 'open') b.push(`<span class="badge">${esc(r.status)}</span>`);
    if (r.upcoming) b.push(`<span class="badge soon">${esc(soonLabel(r))}</span>`);
    else if (r.isNew) b.push('<span class="badge solid">New</span>');
    if (r.events.length) b.push('<span class="badge solid">Event</span>');
    if (r.veggieLevel) b.push(`<span class="badge veg lv-${r.veggieLevel}" title="${esc(VEG_LABEL[r.veggieLevel])}">${esc(VEG_SHORT[r.veggieLevel])}</span>`);
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
  const soonLabel = r => { const t = expectedText(r); return t ? `Opening soon · ${t}` : 'Opening soon'; };
  /* shape an upcoming record like a normal place record (defaults for every field the UI reads) */
  function fromUpcoming(u) {
    const passed = expectedPassed(u.expectedOpening);
    return {
      type: null, cuisine: '', cuisineTags: [], chef: u.team || 'unknown', priceLevel: 'unknown', priceFrom: null, phone: null,
      distinctions: { michelin: null, gaultMillau: null }, events: [], photos: [], instagram_posts: [], menuType: 'unknown', menuChanges: 'unknown',
      currentMenuNote: 'unknown', reservation_url: null, status: 'open', statusNote: '', dataConflict: null, vegetarian: 'unknown', vegan: 'unknown',
      ...u,
      features: { ...(u.features || {}) }, features_evidence: { ...(u.features_evidence || {}) },
      instagram: u.instagram_handle ? `https://www.instagram.com/${u.instagram_handle}/` : null,
      summary: u.description, summaryLang: 'en', lastChanged: u.dateChecked, district: u.district || '', neighbourhood: u.neighbourhood || '',
      fromUpcoming: true, upcoming: !passed, isNew: passed,
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
      geoSource: 'OpenStreetMap', openingHoursSource: o.openingHours ? 'OpenStreetMap' : null,
      sources: [`https://www.openstreetmap.org/${o.osm}`], fromOsm: true, curated: false,
      features: { ...(o.features || {}) }, features_evidence: { ...(o.features_evidence || {}) }
    };
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

  /* Google Maps directions (new tab). Destination = name + address (+ Gent); lat,lng if no address; place_id only when we have a real one */
  function directionsUrl(r) {
    const clean = t => String(t || '').replace(/\s*\([^)]*\)/g, '').trim();   // drop notes like "(former Club 69)"
    const addr = known(r.address) ? clean(r.address) : '', name = clean(r.name);
    const dest = addr ? `${name}, ${addr}${/gent|ghent/i.test(addr) ? '' : ', Gent'}` : (r.lat ? `${r.lat},${r.lng}` : `${name}, Gent`);
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
    CUR = city;
    const cityItems = co => co.cities.map(c => c.active
      ? `<li role="option" aria-current="${c.id === city.id}"><a class="ci" href="${cityUrl('index.html', c.id)}">${esc(c.name)}<em>${c.id === city.id ? '●' : ''}</em></a></li>`
      : `<li role="option" aria-disabled="true"><span class="ci soon">${esc(c.name)}<em>soon</em></span></li>`).join('');
    document.querySelectorAll('[data-citysel]').forEach(el => {
      el.classList.add('placesel');
      el.innerHTML = `
        <div class="citysel" data-dd="country"><button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose country">${esc(city.country)}</button>
          <ul role="listbox">${cfg.countries.map(co => co.active
            ? `<li role="option" aria-current="${co.id === city.countryId}"><button type="button" class="ci" data-country="${esc(co.id)}">${esc(co.name)}<em>${co.id === city.countryId ? '●' : ''}</em></button></li>`
            : `<li role="option"><button type="button" class="ci soon" data-soon="${esc(co.name)}" aria-label="${esc(co.name)}, coming soon">${esc(co.name)}<em>soon</em></button></li>`).join('')}
            <li class="soon-msg" hidden></li></ul></div>
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
    document.querySelectorAll('[data-home]').forEach(a => a.href = cityUrl('index.html', city.id) + (a.dataset.home || ''));
  }
  function renderFooter(cfg, city, extra = '') {
    const fam = cfg.brand.family.map(f => `<a href="https://${esc(f.domain)}" rel="noopener" title="${esc(f.domain)} – ${esc(f.status)}"><span class="wordmark"><span class="wm-main">${esc(f.name.split(' ')[0])}</span><span class="wm-sub">and the City</span></span></a> <span style="opacity:.6">(${esc(f.status)})</span>`).join(' · ');
    document.querySelectorAll('[data-footer]').forEach(el => el.innerHTML = `
      <a class="wordmark" href="${cityUrl('index.html', city.id)}"><span class="wm-main">Table</span><span class="wm-sub">and the City</span></a>
      <div class="family">Part of the <i style="font-family:var(--serif-it);text-transform:none;font-size:15px;letter-spacing:.02em">… and the City</i> family<br>${fam}</div>
      <a href="#top">Back to top ↑</a>
      <div class="meta"><span>${esc(cfg.brand.domain)} · prototype</span><span>${esc(city.name)}, ${esc(city.country)}</span><span>${extra || 'Data: Michelin · Gault&amp;Millau · own websites · press'}</span><span>Base list: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL) · veggie levels: own checks + HappyCow</span></div>`);
  }

  /* ---- data ---- */
  async function load(city) {
    const opt = (url, empty) => url ? fetch(bust(url), { cache: 'no-cache' }).then(r => r.ok ? r.json() : empty).catch(() => empty) : Promise.resolve(empty);
    const [d, up, om, vg, hz, bk] = await Promise.all([fetch(bust(city.data), { cache: 'no-cache' }).then(r => r.json()), opt(city.upcoming, { upcoming: [] }), opt(city.osm, { places: [] }), opt(city.veggie, { places: {} }),
      opt(city.heroes, { places: {} }), opt(city.breakfast, { places: {} })]);
    const rs = d.restaurants.filter(r => r.status !== 'unverified');   // unverified records stay in the data, never shown
    rs.forEach(r => { r.curated = true; });                             // hand-curated records rank first
    const today = new Date().toISOString().slice(0, 10);              // a temporary status (e.g. closed for renovation) ends by itself
    rs.forEach(r => { if (r.statusUntil && today > r.statusUntil) { r.status = 'open'; r.statusNote = ''; } });
    const ids = new Set(rs.map(r => r.id));                            // once moved into <city>.json, that record wins
    rs.push(...(up.upcoming || []).filter(u => u.id && !ids.has(u.id)).map(fromUpcoming));
    rs.push(...(om.places || []).filter(o => !ids.has(o.id) && o.status !== 'closed').map(fromOsm));   // OpenStreetMap base list (deduped at import time)
    rs.forEach(r => applyVeg(r, (vg.places || {})[r.id]));
    rs.forEach(r => { const h = (hz.places || {})[r.id]; if (h && !r.heroImage) r.heroImage = h; applyMeal(r, (bk.places || {})[r.id]); });
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
  return { openState, openLabel, OPEN_RANK, openFrom, mealOf, VEG_LABEL, VEG_SHORT, directionsUrl, featureTiles, expectedPassed, expectedText, soonLabel, GROUP_LABEL, CAT_LABEL, catLabel, realPhotos, initials, thumb, carousel, wasDragged, BRAND, LOCALE, TODAY, U, TYPE_IMG, TYPE_KEY, imgAttrs, liveEvent, nextOccurrence, TYPE_LABEL, esc, known, fmtDate, eur, priceNum, isStar, distRank, stars, isUpcoming, badges,
    cities, currentCity, cityUrl, renderCitySel, renderFooter, load, haversine, bindNav };
})();
