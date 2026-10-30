/* "Find my table" – a short quiz (mood → up to 6 questions, most skipped adaptively) that returns a handful of matching places.
   Lives entirely in this file + the "Find my table" section of css/style.css. Hooks: the hero button [data-quiz-open] (index.html)
   and window.TGApp (set by js/app.js once the data is loaded: places, events, the list's own filters and booking button).
   Data rules are the site's own: same place list (exclusions unchanged), veggie/vegan = the Veggie & vegan / Vegan options chips,
   opening hours via js/hours.js in Europe/Brussels (known closed on the chosen day → never shown; unknown hours → ranked lower).
   Nothing here claims a table is available. */
(function () {
  'use strict';
  const H = window.TGHours, esc = TG.esc;
  const ready = new Promise(res => { if (window.TGApp) res(window.TGApp); else document.addEventListener('tg:ready', () => res(window.TGApp), { once: true }); });
  let APP = null, root = null, lastFocus = null;
  const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY = H.DAY_NAMES;

  /* ---------- days (Europe/Brussels) ---------- */
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const shortDate = iso => TG.fmtDate(iso, { day: 'numeric', month: 'short' });
  function clock() {
    const b = H.brussels(new Date());
    // weekend = Sat + Sun; on a Sunday "this weekend" would just be today, so the next one is offered instead
    const sat = b.dow === 6 ? 6 : 5 - b.dow;
    const wk = b.dow === 5 ? [0, 1] : [sat, sat + 1];
    return { ...b, day: k => ({ k, iso: addDays(b.iso, k), dow: (b.dow + k) % 7 }), off: iso => Math.round((Date.parse(iso) - Date.parse(b.iso)) / 864e5),
      wk, wkLabel: b.dow === 6 ? 'Next weekend' : 'This weekend' };
  }
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  /* one place on one day: 'open' (opening hours list hours that day [after `from` minutes for today]) | 'closed' (known closed) | 'unknown' */
  function dayState(r, d, from = 0) {
    if (r.status && r.status !== 'open' && !(r.statusUntil && d.iso > r.statusUntil)) return { s: 'closed' };
    if (r.openingHoursNote || !TG.known(r.openingHours)) return { s: 'unknown' };
    const P = H.parse(r.openingHours);
    if (!P.ok || (P.ph && H.isHoliday(d.iso))) return { s: 'unknown' };
    const iv = P.days[d.dow];
    if (iv === null) return { s: 'unknown' };
    if (d.k === 0 && TG.openState(r).state === 'open') return { s: 'open', iv, now: true };
    const later = iv.filter(x => x.e == null || x.e > from);
    if (later.length) return { s: 'open', iv };
    return { s: d.k === 0 && P.openEnd ? 'unknown' : 'closed' };
  }
  const RANK = { open: 0, unknown: 1, closed: 2 };
  /* a "when" answer → { s, now, days:[{dow, iv}] } (several days: open if open on any, closed only if closed on all) */
  function whenState(r, when, C) {
    if (!when) { const o = TG.openState(r).state; return { s: o, now: o === 'open', days: [] }; }
    const spec = whenSpec(when, C), res = spec.days.map(k => { const d = C.day(k); return { d, ...dayState(r, d, spec.from || 0) }; });
    const s = res.some(x => x.s === 'open') ? 'open' : res.every(x => x.s === 'closed') ? 'closed' : 'unknown';
    return { s, now: res.some(x => x.now), days: res.filter(x => x.s === 'open').map(x => ({ dow: x.d.dow, iv: x.iv })) };
  }
  const WHEN = {
    now: C => ({ days: [0], from: C.mins, nowOnly: true }),
    today: C => ({ days: [0], from: C.mins }),
    tonight: C => ({ days: [0], from: Math.max(C.mins, 20 * 60) }),
    tomorrow: () => ({ days: [1] }),
    weekend: C => ({ days: C.wk })
  };
  /* a picked date is stored as "d:YYYY-MM-DD": same rules as Tomorrow (today → from now on) */
  const isPick = v => typeof v === 'string' && v.startsWith('d:');
  function whenSpec(v, C) {
    if (!isPick(v)) return WHEN[v](C);
    const k = C.off(v.slice(2)); return k <= 0 ? { days: [0], from: C.mins } : { days: [k] };
  }
  const dowOf = iso => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const dateLabel = iso => `${DAY[dowOf(iso)]} ${shortDate(iso)}`;     // "Sat 7 Nov"
  const PLACE_DAYS = 60;
  const ivText = iv => iv.map(x => x.e == null ? `from ${hhmm(x.s)}` : `${hhmm(x.s)}–${hhmm(x.e)}`).join(', ');

  /* ---------- sections: questions, answers and how each maps to data ---------- */
  const isR = r => r.group === 'restaurants';
  const STYLE = {
    casual: r => ['casual', 'restaurant'].includes(r.category),
    moderate: r => ['bistro', 'brasserie', 'gastro-bistro'].includes(r.category),
    fancy: r => ['fine dining', 'gastro-bistro'].includes(r.category) || TG.isStar(r.distinctions.michelin)
  };
  const DIET = { veggie: r => !!r.veggieLevel, vegan: r => r.vegan === 'yes' };   // = the Veggie & vegan / Vegan options chips
  /* three equal answers (no separate 'No preference' link on this step); the diet is never relaxed silently, see results() */
  const DIET_Q = { id: 'diet', q: 'Any dietary wishes?', short: 'Diet', hard: true, relax: 'diet', noSkip: true, minViable: 1, opts: [
    { v: 'any', l: 'No preference', s: 'Everything, meat and fish included', chip: 'Any diet', all: true },
    { v: 'veggie', l: 'Veggie', s: 'Vegetarian, vegan or clear veggie options', f: DIET.veggie },
    { v: 'vegan', l: 'Vegan', s: 'Fully vegan or clear vegan options', f: DIET.vegan }] };
  /* restaurant path (see handoff/quiz-redesign/proposal.md): 'Something regular' or 'A specific cuisine' first; the cuisine path asks one of
     7 broad groups (TG.CZ_GROUPS: European, Asian, …), then a detailed cuisine only when the group still splits (adaptive rule). Places without a known cuisine stay in the regular path. */
  const KIND_Q = { id: 'kind', q: 'What are you in the mood for?', hard: true, noSkip: true, minViable: 1, opts: [
    { v: 'regular', l: 'Something regular', s: 'Good food, any kitchen', chip: 'Any kitchen', all: true },
    { v: 'cuisine', l: 'A specific cuisine', s: 'Pick a kitchen', f: r => TG.hasCuisine(r) }] };
  const FAMILY_Q = { id: 'family', q: 'Which kitchen?', short: 'Cuisine', hard: true, cond: a => a.kind === 'cuisine', opts: [] };
  const SUB_Q = { id: 'sub', q: 'Which one?', hard: true, relax: 'sub', compact: true, cond: a => !!a.family && (TG.CZ_BY[a.family].members || []).length > 1, opts: [] };
  const fillFood = () => { if (FAMILY_Q.opts.length) return;
    FAMILY_Q.opts = TG.CZ_FAMILIES.map(f => ({ v: f.members.length > 1 ? f.id : f.members[0], l: f.label, s: f.s, f: r => TG.inCuisine(r, f.id) }));
    SUB_Q.opts = [{ v: 'any', l: 'Any of these', chip: 'Any of these', all: true },
      ...TG.CZ_FAMILIES.filter(f => f.members.length > 1).flatMap(f => f.members.map(m => ({ v: m, fam: f.id, l: TG.CZ_BY[m].label, f: r => TG.inCuisine(r, m) })))]; };
  const whenQ = (q, list) => ({ id: 'when', q, hard: true, when: true, opts: list });
  const W = {
    now: (l = 'Right now') => ({ v: 'now', l, s: C => `Open now · ${DAY_LONG[C.dow]}` }),
    today: (l = 'Today') => ({ v: 'today', l, s: () => 'Open now or later today' }),
    tonight: () => ({ v: 'tonight', l: 'Now / tonight', s: () => 'Open now or after 20:00' }),
    tomorrow: () => ({ v: 'tomorrow', l: 'Tomorrow', s: C => DAY_LONG[(C.dow + 1) % 7] }),
    weekend: () => ({ v: 'weekend', l: C => C.wkLabel, s: C => `Sat ${shortDate(C.day(C.wk[0]).iso)} – Sun ${shortDate(C.day(C.wk[1]).iso)}` }),
    pick: () => ({ v: 'pick', pick: true, l: 'Pick a date', s: C => `Any day until ${dateLabel(C.day(PLACE_DAYS).iso)}` })
  };
  const DIET_ON = a => a.diet === 'veggie' || a.diet === 'vegan';
  /* the diet label on a result card: fully vegetarian / vegan places, or places with clear options */
  const DIET_LABEL = { vegan: 'Fully vegan', vegetarian: 'Fully vegetarian', 'vegan-friendly': 'Vegan options', 'veggie-friendly': 'Veggie options' };
  const dietLabel = r => r.veggieLevel === 'vegetarian' && r.vegan === 'yes' ? 'Fully vegetarian · vegan options' : DIET_LABEL[r.veggieLevel] || '';
  const FULLY = r => r.veggieLevel === 'vegan' || r.veggieLevel === 'vegetarian';
  const VR = r => ({ vegan: 4, vegetarian: 3, 'vegan-friendly': 2, 'veggie-friendly': 1 }[r.veggieLevel] || 0);
  const base = r => (r.curated ? 20 : 0) + TG.distRank(r) / 20;
  const SECTIONS = {
    restaurant: {
      label: 'Restaurant', sub: 'Lunch or dinner', noun: ['table', 'tables'], pool: r => isR(r),
      questions: [
        KIND_Q, FAMILY_Q, SUB_Q,
        { id: 'style', q: 'What style?', short: 'Style', hard: true, relax: 'style', opts: [
          { v: 'casual', l: 'Casual', s: 'Easy-going, all kinds of kitchens', f: STYLE.casual },
          { v: 'moderate', l: 'Moderate', s: 'Bistros, brasseries, gastro-bistros', f: STYLE.moderate },
          { v: 'fancy', l: 'Fancy', s: 'Fine dining, gastro-bistros, Michelin stars', f: STYLE.fancy }] },
        DIET_Q,
        whenQ('When?', [W.today(), W.tomorrow(), W.weekend(), W.pick()]),
      ],
      relaxOrder: ['style', 'sub', 'diet'],
      adaptive: true,
      score(r, a) {
        const c = r.category, star = TG.isStar(r.distinctions.michelin);
        let s = base(r);
        if (a.style === 'fancy') s += (c === 'fine dining' ? 6 : c === 'gastro-bistro' ? 4 : 0) + (star ? 4 : 0);
        if (a.style === 'moderate') s += c === 'gastro-bistro' ? 3 : 2;
        if (DIET_ON(a)) s += VR(r);
        return s;
      },
      list(a) {
        const type = { casual: 'casual+restaurant', moderate: 'bistro+brasserie+gastro-bistro', fancy: 'fine dining+gastro-bistro' }[a.style];
        const cz = a.sub && a.sub !== 'any' ? a.sub : a.family;
        return { group: 'restaurants', ...(type ? { type } : {}), ...(cz ? { cuisine: cz } : {}), ...dietF(a) };
      }
    },
    bar: {
      label: 'Bar', sub: 'Cocktails, wine, brown cafés, pubs, dancing', noun: ['bar', 'bars'], pool: r => r.group === 'cafes_bars',
      questions: [
        /* live music (data/cities/<city>-livemusic.json): asked whenever at least one bar has it (`always`); too few exact matches → results() relaxes it last, live places stay on top */
        { id: 'live', q: 'Do you want live music?', short: 'Live music', hard: true, relax: 'live', noSkip: true, always: true, opts: [
          { v: 'yes', l: 'Yes, live music', s: 'Concerts, jazz nights, jam sessions', f: r => !!r.liveMusic },
          { v: 'any', l: 'Doesn’t matter', s: 'All bars', chip: 'Any bar', all: true }] },
        { id: 'type', q: 'What kind of bar?', short: 'Kind of bar', hard: true, relax: 'type', opts: [
          { v: 'cocktail_bar', l: 'Cocktail bar', s: 'Signature drinks, mocktails' }, { v: 'brown_cafe', l: 'Brown café', s: () => `Classic ${(APP && APP.city && APP.city.name) || 'local'} pub` },
          { v: 'wine_bar', l: 'Wine bar', s: 'Wine by the glass, small plates' },
          { v: 'irish_pub', l: 'Irish pub', s: 'Pints & sport' }, { v: 'dance_cafe', l: 'Dance café', s: 'DJ, late nights' }].map(o => ({ ...o, f: r => r.category === o.v })) },
        whenQ('When?', [W.tonight(), W.tomorrow(), W.weekend(), W.pick()]),
        { id: 'terrace', q: 'Terrace?', short: 'Terrace', hard: true, relax: 'terrace', minViable: 1, opts: [{ v: 'yes', l: 'Yes, a terrace', s: 'Confirmed terrace', f: r => r.features.terrace === true }] }
      ],
      relaxOrder: ['terrace', 'type', 'live'], adaptive: true,
      score: (r, a) => base(r) + (a.live === 'yes' && r.liveMusic ? 30 : 0) + (r.features.terrace === true ? 1 : 0) + (r.features.lateNight === true && a.when === 'tonight' ? 2 : 0),
      list: a => ({ group: 'cafes_bars', ...(a.live === 'yes' ? { live: true } : {}), ...(a.type ? { type: a.type } : {}), ...(a.when === 'now' ? { open: true } : {}) })
    },
    coffee: {
      label: 'Coffee', sub: 'Specialty coffee, brunch, laptop spots', noun: ['coffee spot', 'coffee spots'], pool: r => r.group === 'coffee',
      questions: [
        { id: 'purpose', q: 'What for?', short: 'What for', hard: true, relax: 'purpose', opts: [
          { v: 'quick', l: 'A quick specialty coffee', s: 'Specialty coffee bars', f: r => r.category === 'coffee_bar' },
          { v: 'food', l: 'Coffee + something to eat', s: 'Food served, breakfast or brunch', f: r => r.features.foodServed === true || TG.mealOf(r).any },
          { v: 'laptop', l: 'Work with my laptop', s: 'Wifi confirmed', f: r => r.features.wifi === true }] },
        DIET_Q,
        whenQ('When?', [W.now(), W.today(), W.tomorrow(), W.weekend(), W.pick()])
      ],
      adaptive: true,
      score: (r, a) => base(r) + (a.purpose === 'food' && TG.mealOf(r).any ? 2 : 0) + (r.features.seating === true && a.purpose === 'laptop' ? 1 : 0) + (DIET_ON(a) ? VR(r) : 0),
      list: a => ({ group: 'coffee', ...(a.purpose === 'quick' ? { type: 'coffee_bar' } : {}), ...dietF(a), ...(a.when === 'now' ? { open: true } : {}) })
    },
    bakery: {
      label: 'Bakery', sub: 'Bread, viennoiserie, patisserie', noun: ['bakery', 'bakeries'], pool: r => r.group === 'bakeries',
      questions: [
        { id: 'kind', q: 'Bread or something sweet?', short: 'Bread or sweet', hard: true, relax: 'kind', opts: [
          { v: 'bread', l: 'Bread & viennoiserie', s: 'Sourdough, croissants', f: r => r.category === 'bakery' || (r.bakeryStyle || []).some(x => /sourdough|viennoiserie|bread|traditional|mastellen/.test(x)) },
          { v: 'sweet', l: 'Patisserie & sweet', s: 'Cakes, tarts, pastries', f: r => r.category === 'patisserie' || (r.bakeryStyle || []).some(x => /patisserie|cakes|tarts/.test(x)) }] },
        DIET_Q,
        whenQ('When?', [W.now('Open now'), W.today(), W.tomorrow(), W.weekend(), W.pick()])
      ],
      adaptive: true,
      score: (r, a) => base(r) + (DIET_ON(a) ? VR(r) : 0),
      list: a => ({ group: 'bakeries', ...(a.kind ? { type: a.kind === 'bread' ? 'bakery' : 'patisserie' } : {}), ...dietF(a), ...(a.when === 'now' ? { open: true } : {}) })
    },
    event: {
      label: 'Event', sub: 'Chef collabs, pop-ups, nights out', noun: ['event', 'events'], events: true,
      questions: [
        { id: 'ewhen', q: 'When?', hard: true, relax: 'ewhen', opts: [
          { v: 'week', l: 'This week', s: C => `${shortDate(C.iso)} – ${shortDate(C.day(6).iso)}`, f: (e, C) => evIn(e, C.iso, C.day(6).iso) },
          { v: 'weekend', l: C => C.wkLabel, s: C => `Fri ${shortDate(C.day(C.wk[0] - 1).iso)} – Sun ${shortDate(C.day(C.wk[1]).iso)}`, f: (e, C) => evIn(e, C.day(Math.max(0, C.wk[0] - 1)).iso, C.day(C.wk[1]).iso) },
          { v: 'later', l: 'Later', s: C => `From ${shortDate(C.day(7).iso)}`, f: (e, C) => (e.dateEnd || e.dateStart) >= C.day(7).iso },
          { v: 'pick', pick: true, l: 'Pick a date', s: C => `Any day until ${dateLabel(lastEv(C))}` }] },
        { id: 'ekind', q: 'What kind?', hard: true, relax: 'ekind', opts: [
          { v: 'food', l: 'Food & chefs', s: 'Pop-ups, chef collabs, dinners, festivals', f: e => !NIGHT.test(e.type) },
          { v: 'night', l: 'Night out', s: 'Concerts & club nights', f: e => NIGHT.test(e.type) }] }
      ],
      relaxOrder: ['ekind', 'ewhen'],
      score: () => 0
    }
  };
  const NIGHT = /concert|club night|dj set|party/i;
  const evIn = (e, from, to) => e.dateStart <= to && (e.dateEnd || e.dateStart) >= from;
  const lastEv = C => APP.E.reduce((m, e) => (e.dateEnd || e.dateStart) > m ? (e.dateEnd || e.dateStart) : m, C.iso);
  const evDist = (e, iso) => iso < e.dateStart ? (Date.parse(e.dateStart) - Date.parse(iso)) / 864e5 : iso > (e.dateEnd || e.dateStart) ? (Date.parse(iso) - Date.parse(e.dateEnd || e.dateStart)) / 864e5 : 0;
  const dietF = a => a.diet === 'veggie' ? { veggie: true } : a.diet === 'vegan' ? { vegan: true } : {};
  const MOODS = ['restaurant', 'bar', 'coffee', 'bakery', 'event'];
  /* the quiz's first question; also shown in the hero's speech bubble under the button (heroBubble below), so it is read from here only */
  const MOOD_Q = { id: 'mood', q: 'What’s the mood?' };
  /* the moods this city really has (an empty section is never offered), in quiz order */
  const moodOpts = C => MOODS.map(m => ({ v: m, l: SECTIONS[m].label, s: SECTIONS[m].sub, n: m === 'event' ? APP.E.length : matches(SECTIONS[m], {}, C).length })).filter(o => o.n > 0);

  /* ---------- matching ---------- */
  function qOpt(sec, id, v) {
    if (isPick(v)) { const iso = v.slice(2); return { v, l: dateLabel(iso), f: e => evIn(e, iso, iso) }; }
    const q = sec.questions.find(x => x.id === id); return q && q.opts.find(o => o.v === v);
  }
  /* places matching every hard answer in `a` except the ones in `skip` (soft answers never filter) */
  function matches(sec, a, C, skip = []) {
    if (sec.events) return APP.E.filter(e => Object.entries(a).every(([k, v]) => skip.includes(k) || !v || qOpt(sec, k, v).f(e, C)));
    return APP.R.filter(r => {
      if (r.upcoming || !sec.pool(r)) return false;                      // announced, not open yet
      for (const [k, v] of Object.entries(a)) {
        if (!v || skip.includes(k)) continue;
        if (k === 'when') { r._w = whenState(r, v, C); if (r._w.s === 'closed' || (whenSpec(v, C).nowOnly && r._w.s !== 'open')) return false; continue; }
        const o = qOpt(sec, k, v); if (o && o.f && !o.f(r)) return false;
      }
      if (!a.when) r._w = whenState(r, '', C);
      return true;
    });
  }
  function results(sec, a, C) {
    const order = sec.relaxOrder || sec.questions.filter(q => q.relax).map(q => q.relax);   // least important first
    const exact = matches(sec, a, C);
    let list = exact, relaxed = null, near = '', dietMsg = '', dietTo = null;   // dietTo: the diet the shown list really uses
    const pickIso = sec.events && isPick(a.ewhen) ? a.ewhen.slice(2) : '';
    if (pickIso && exact.length < 3) {                                     // a picked day: fill up with the events nearest to it
      list = matches(sec, a, C, ['ewhen']); if (list.length <= exact.length) list = matches(sec, a, C, ['ewhen', 'ekind']);
      near = exact.length ? `Only ${exact.length} on ${dateLabel(pickIso)} — nearest dates added.` : `Nothing on ${dateLabel(pickIso)} — here are the nearest events.`;
    } else if (exact.length < 3 && a.diet === 'vegan' && !sec.events) {   // too few vegan options: say so, then show vegetarian places
      const veg = matches(sec, { ...a, diet: 'veggie' }, C);
      if (veg.length > exact.length) {
        list = veg; dietTo = 'veggie'; dietMsg = exact.length ? `Only ${exact.length} place${exact.length === 1 ? '' : 's'} with vegan options for this choice — places with vegetarian options added below.` : `No vegan options for this choice. Here are ${veg.every(FULLY) ? 'vegetarian places' : 'places with vegetarian options'} instead.`;
      } else if (!exact.length) {
        list = matches(sec, a, C, ['diet']); dietTo = ''; if (list.length) dietMsg = 'No vegan or vegetarian options for this choice. These places have no confirmed veggie options.';
      }
    } else if (exact.length < 3) {
      for (const k of order) {
        if (!a[k] || k === 'when' || k === 'diet') continue;              // "when" is never relaxed: known-closed places stay out; the diet only with a clear message
        const wider = matches(sec, a, C, [k]);
        if (wider.length > exact.length) { list = wider; relaxed = k; break; }
      }
      if (!list.length && a.diet === 'veggie') {
        list = matches(sec, a, C, ['diet']); dietTo = ''; if (list.length) dietMsg = 'No veggie options for this choice. These places have no confirmed veggie options.';
      }
    }
    const ok = new Set(exact);
    if (sec.events) {
      list = list.slice().sort((x, y) => (ok.has(y) - ok.has(x)) || (pickIso ? evDist(x, pickIso) - evDist(y, pickIso) : 0) || x.dateStart.localeCompare(y.dateStart));
    } else {
      list.forEach(r => { r._w = whenState(r, a.when, C); r._s = sec.score(r, a) + (ok.has(r) ? 50 : 0); });
      const tier = r => r._w.now ? 0 : RANK[r._w.s] + 1;                  // open now › open that day › unknown hours
      list = list.slice().sort((x, y) => (relaxed === 'live' ? ok.has(y) - ok.has(x) : 0) || (a.when && a.when !== 'now' && a.when !== 'today' ? RANK[x._w.s] - RANK[y._w.s] : tier(x) - tier(y)) || y._s - x._s || x.name.localeCompare(y.name, 'en'));
    }
    return { list, exactN: exact.length, relaxed, near, dietMsg, dietTo };
  }

  /* ---------- UI ---------- */
  const st = { mood: '', a: {}, step: 0, steps: [], skipped: {}, pick: null };   // pick: { iso, month } while the date picker is open
  function mount() {
    root = document.createElement('div');
    root.className = 'qz'; root.hidden = true;
    root.innerHTML = `<div class="qz__scrim" data-qz-close></div>
      <div class="qz__sheet" role="dialog" aria-modal="true" aria-labelledby="qz-title">
        <div class="qz__bar">
          <button class="qz__back" type="button" data-qz-back aria-label="Back"><span>Back</span></button>
          <div class="qz__dots" aria-hidden="true"></div>
          <button class="qz__x" type="button" data-qz-close aria-label="Close">Close</button>
        </div>
        <div class="qz__body" tabindex="-1"></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      const b = e.target.closest('.bk'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.click(); }
      if (e.key === 'Tab') {                                               // keep focus inside the sheet
        const f = [...root.querySelectorAll('.qz__sheet button:not([disabled]), .qz__sheet a[href], .qz__sheet [tabindex="0"]')].filter(x => x.offsetParent);
        if (!f.length) return; const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  /* open(mood): with a mood (a chip in the hero bubble) that answer is pre-selected and the quiz starts at question 2 */
  async function open(mood) {
    if (!root) mount();
    lastFocus = document.activeElement;
    root.hidden = false; document.documentElement.classList.add('qz-lock');
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (!APP) { body().innerHTML = '<p class="qz__loading">Loading places…</p>'; APP = await ready; }
    fillFood();
    restart(mood);
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open'); document.documentElement.classList.remove('qz-lock');
    setTimeout(() => { root.hidden = true; }, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const body = () => root.querySelector('.qz__body');
  function restart(mood) {
    st.mood = ''; st.a = {}; st.step = 0; st.steps = []; st.skipped = {}; st.pick = null;
    if (typeof mood === 'string' && SECTIONS[mood] && moodOpts(clock()).some(o => o.v === mood)) { st.mood = mood; st.steps = SECTIONS[mood].questions; }
    draw();
  }
  const val = (x, C) => typeof x === 'function' ? x(C) : x;

  /* answers shown for question i: only those with at least one match given the earlier answers */
  function optionsFor(sec, i, C) {
    const q = st.steps[i], prev = {};
    st.steps.slice(0, i).forEach(p => { if (st.a[p.id]) prev[p.id] = st.a[p.id]; });
    return q.opts.filter(o => !o.fam || o.fam === prev.family).map(o => {
      const n = q.hard && !o.pick ? matches(sec, { ...prev, [q.id]: o.v }, C).length : null;
      return { ...o, n };
    }).filter(o => o.n == null || o.n > 0 || q.id === 'diet');            // diet: always the same three answers (an empty Vegan gets an honest fallback)
  }
  /* adaptive steps (sections with `adaptive`, proposal §4): a step is skipped when its answer could not split the places still left.
     Hard (filtering) steps: asked only with > 6 places left, enough viable answers (>= 3 places and fewer than all; non-viable answers are
     hidden; `all` answers = keep everything) and not lopsided (top answer > 85% while the rest keep < 8). 'When': unless <= 3 left.
     Soft steps (re-rank only): their own ask(list) test, answers without any matching place (has) hidden. Returns { skip } or { opts }. */
  function stepPlan(sec, i, C) {
    const q = st.steps[i], prev = prevA(i);
    if (q.cond && !q.cond(prev)) return { skip: 'cond' };
    const opts = optionsFor(sec, i, C);
    if (!sec.adaptive) {
      if (!opts.length || (q.hard && !q.when && opts.every(o => o.n === matches(sec, prev, C).length))) return { skip: 'rule' };
      return { opts };
    }
    if (q.always) return opts.some(o => !o.all) ? { opts } : { skip: 'rule' };   // e.g. live music: asked as long as one place has it
    const L = matches(sec, prev, C), n = L.length;
    if (q.when) return n <= 3 ? { skip: 'rule' } : { opts };
    if (n <= 6) return { skip: 'rule' };
    if (q.hard) {
      const spec = opts.filter(o => !o.all && !o.pick), viable = spec.filter(o => o.n >= 3 && o.n < n);
      if (viable.length < (q.minViable || 2)) return { skip: 'rule' };
      const ks = spec.map(o => o.n).sort((x, y) => y - x), rest = ks.slice(1).reduce((x, y) => x + y, 0);
      if (ks[0] > .85 * n && rest < 8) return { skip: 'rule' };
      return { opts: opts.filter(o => o.all || o.pick || viable.includes(o)) };
    }
    if (q.ask && !q.ask(L)) return { skip: 'rule' };
    const shown = opts.filter(o => !o.has || L.some(o.has));
    return shown.length < 2 ? { skip: 'rule' } : { opts: shown };
  }
  function draw() {
    const C = clock();
    const dots = root.querySelector('.qz__dots'), back = root.querySelector('[data-qz-back]');
    const total = st.mood ? st.steps.length + 2 : 5, cur = !st.mood ? 0 : st.step + 1;
    dots.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < cur ? 'done' : i === cur ? 'on' : ''}"></i>`).join('');
    back.style.visibility = st.mood ? 'visible' : 'hidden';
    if (!st.mood) {
      const opts = moodOpts(C);
      return paint(`<p class="qz__eyebrow">Find my table</p><h2 class="qz__q" id="qz-title">${esc(MOOD_Q.q)}</h2>
        <div class="qz__opts">${opts.map(o => optBtn(o, 'mood', C)).join('')}</div>`);
    }
    const sec = SECTIONS[st.mood];
    if (st.step >= st.steps.length) return drawResults(sec, C);
    const q = st.steps[st.step], plan = stepPlan(sec, st.step, C);
    if (plan.skip) { st.a[q.id] = ''; st.skipped[st.step] = plan.skip; st.step++; return draw(); }   // nothing to choose: skip (and on Back)
    const opts = plan.opts;
    // "n of m": questions asked so far + this one, of that + the later steps that can still come (each may still be skipped)
    const asked = st.steps.slice(0, st.step).filter((x, j) => !st.skipped[j]).length + 1;
    const of = asked + st.steps.slice(st.step + 1).filter(x => !x.cond || x.cond(prevA(st.step)) || (q.id === 'kind' && x.id === 'family')).length;
    const hasPick = opts.some(o => o.pick);
    if (hasPick && !st.pick && isPick(st.a[q.id])) st.pick = { iso: st.a[q.id].slice(2), month: st.a[q.id].slice(2, 9) };   // back to a picked date
    paint(`<p class="qz__eyebrow">${esc(sec.label)} · ${asked} of ${of}</p><h2 class="qz__q" id="qz-title">${esc(q.q)}</h2>
      <div class="qz__opts${q.compact ? ' qz__opts--compact' : ''}">${opts.map(o => optBtn(o, q.id, C)).join('')}</div>
      ${hasPick && st.pick ? `<div class="qz-cal" role="group" aria-label="Pick a date">${calHtml(sec, q, C)}</div>` : ''}
      ${q.noSkip ? '' : '<button class="qz__skip" type="button" data-qz-skip>No preference</button>'}`);
    const cal = root.querySelector('.qz-cal');
    if (cal) { cal.scrollIntoView({ block: 'nearest' }); const d = cal.querySelector('[aria-pressed="true"], .qz-cal__d:not([disabled])'); if (d) d.focus({ preventScroll: true }); }
  }
  /* compact month calendar: today … +60 days (events: … the last event day); event days get a dot */
  function calHtml(sec, q, C) {
    const P = st.pick, min = C.iso, max = sec.events ? lastEv(C) : C.day(PLACE_DAYS).iso;
    const [y, m] = P.month.split('-').map(Number), first = `${P.month}-01`, lead = dowOf(first), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const evDays = sec.events ? new Set(APP.E.flatMap(e => { const out = []; for (let d = e.dateStart; d <= (e.dateEnd || e.dateStart) && out.length < 62; d = addDays(d, 1)) out.push(d); return out; })) : null;
    // in the current month, whole weeks before today are left out (keeps the sheet short on phones)
    const skipW = P.month === min.slice(0, 7) ? Math.floor((lead + +min.slice(8) - 1) / 7) : 0;
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="qz-cal__wd" aria-hidden="true">${d}</span>`).join('') + '<span></span>'.repeat(skipW ? 0 : lead);
    for (let i = skipW ? skipW * 7 - lead + 1 : 1; i <= n; i++) {
      const iso = `${P.month}-${String(i).padStart(2, '0')}`, off = iso < min || iso > max;
      cells += `<button class="qz-cal__d${iso === C.iso ? ' is-today' : ''}${evDays && evDays.has(iso) ? ' has-ev' : ''}" type="button" data-qz-day="${iso}" aria-label="${esc(TG.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}" aria-pressed="${iso === P.iso}"${off ? ' disabled' : ''}>${i}</button>`;
    }
    const mName = TG.fmtDate(first, { month: 'long', year: 'numeric' });
    let go = '<button class="pill-btn dark qz-cal__go" type="button" disabled>Choose a day</button>';
    if (P.iso) {
      const cnt = matches(sec, { ...prevA(st.step), [q.id]: 'd:' + P.iso }, C).length, noun = sec.noun[cnt === 1 ? 0 : 1];
      go = `<button class="pill-btn dark qz-cal__go" type="button" data-qz-date-go>${sec.events && !cnt ? `${esc(dateLabel(P.iso))} · show nearest events` : `${esc(dateLabel(P.iso))} · ${cnt} ${esc(noun)}`}</button>`;
    }
    return `<div class="qz-cal__head"><button class="qz-cal__nav" type="button" data-qz-month="-1" aria-label="Previous month"${first <= min ? ' disabled' : ''}>‹</button>
      <b class="qz-cal__m" aria-live="polite">${esc(mName)}</b>
      <button class="qz-cal__nav" type="button" data-qz-month="1" aria-label="Next month"${`${P.month}-31` >= max ? ' disabled' : ''}>›</button></div>
      <div class="qz-cal__grid">${cells}</div>${go}`;
  }
  const addMonth = (ym, d) => { let [y, m] = ym.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
  function redrawCal(focusSel) {
    const C = clock(), sec = SECTIONS[st.mood], q = st.steps[st.step], cal = root.querySelector('.qz-cal');
    if (!cal) return draw();
    cal.innerHTML = calHtml(sec, q, C);
    const f = focusSel && cal.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
    if (st.pick.iso) cal.querySelector('.qz-cal__go').scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  function prevA(i) { const p = {}; st.steps.slice(0, i).forEach(q => { if (st.a[q.id]) p[q.id] = st.a[q.id]; }); return p; }
  function optBtn(o, id, C) {
    const sel = id === 'mood' ? st.mood === o.v : o.pick ? !!st.pick || isPick(st.a[id]) : st.a[id] === o.v && !st.pick, s = val(o.s, C);
    return `<button class="qz-opt" type="button" data-q="${esc(id)}" data-v="${esc(o.v)}" aria-pressed="${sel}">
      <span class="qz-opt__t"><span class="qz-opt__l">${esc(val(o.l, C))}</span>${s ? `<span class="qz-opt__s">${esc(s)}</span>` : ''}</span>${o.n != null ? `<b class="qz-opt__n" aria-label="${o.n} matches">${o.n}</b>` : ''}</button>`;
  }
  function paint(html) {
    const b = body(); b.innerHTML = `<div class="qz__step">${html}</div>`; b.scrollTop = 0;
    TG.lazyIg(b);
    const first = b.querySelector('.qz-opt[aria-pressed="true"]') || b.querySelector('.qz-opt, .qz__q');
    if (first) (first.matches('button') ? first : b).focus({ preventScroll: true });
  }

  function drawResults(sec, C) {
    const a = {}; Object.entries(st.a).forEach(([k, v]) => { if (v) a[k] = v; });
    const { list, exactN, relaxed, near, dietMsg, dietTo } = results(sec, a, C);
    const top = list.slice(0, 6);
    const allFully = !sec.events && top.length > 1 && top.every(FULLY) ? (top.every(r => r.veggieLevel === 'vegan') ? 'All of these are fully vegan.' : 'All of these are fully vegetarian.') : '';
    const chips = st.steps.filter(q => a[q.id] && !(q.id === 'kind' && a.kind === 'cuisine')).map(q => { const o = isPick(a[q.id]) ? qOpt(sec, q.id, a[q.id]) : q.opts.find(x => x.v === a[q.id]); return `<li${q.relax === relaxed || (near && q.id === 'ewhen') || (dietMsg && q.id === 'diet') ? ' class="relaxed"' : ''}>${esc(o.chip || val(o.l, C))}</li>`; }).join('');
    const rq = relaxed && st.steps.find(q => q.relax === relaxed);
    const relaxLine = (dietMsg ? `<p class="qz__relax qz__relax--diet">${esc(dietMsg)}</p>` : '') + (allFully ? `<p class="qz__note qz__note--diet">${esc(allFully)}</p>` : '') + (near ? `<p class="qz__relax">${esc(near)}</p>` : rq ? `<p class="qz__relax">Only ${exactN} exact match${exactN === 1 ? '' : 'es'} — we relaxed “${esc(val(qOpt(sec, relaxed, a[relaxed]).l, C))}”.</p>` : '');
    const note = sec.note ? sec.note(a) : '';
    let more = '';
    if (sec.events) more = `<button class="pill-btn dark" type="button" data-qz-all="events">All ${APP.E.length} upcoming events</button>`;
    else { const f = sec.list(dietTo == null ? a : { ...a, diet: dietTo }), n = APP.count(f); more = `<button class="pill-btn dark" type="button" data-qz-all='${esc(JSON.stringify(f))}'>Show all ${n} ${n === 1 ? 'match' : 'matches'}</button>`; }
    paint(`<p class="qz__eyebrow">${esc(sec.label)} · your picks</p>
      <h2 class="qz__q qz__q--res" id="qz-title">${list.length ? `${top.length} ${esc(sec.noun[top.length === 1 ? 0 : 1])} for you` : 'Nothing matches'}</h2>
      ${chips ? `<ul class="qz__chips">${chips}</ul>` : ''}${skippedHtml()}${relaxLine}${note ? `<p class="qz__note">${esc(note)}</p>` : ''}
      <div class="qz__res">${list.length ? top.map(x => sec.events ? evCard(x) : placeCard(x, a, C)).join('') : '<p class="qz__empty">Try fewer wishes, or browse everything.</p>'}</div>
      <div class="qz__end">${more}<button class="qz__skip" type="button" data-qz-restart>Start over</button></div>`);
    root.querySelector('.qz__dots').innerHTML = Array.from({ length: st.steps.length + 2 }, () => '<i class="done"></i>').join('');
  }
  /* the steps left out by the adaptive rule (stepPlan), so it is clear why the quiz was short */
  function skippedHtml() {
    const sk = st.steps.filter((q, i) => st.skipped[i] === 'rule' && q.short);
    return sk.length ? `<div class="qz__skipped"><p class="qz__skipped-t">Not asked — wouldn’t change these results:</p><ul class="qz__chips qz__chips--skip">${sk.map(q => `<li>${esc(q.short)}</li>`).join('')}</ul></div>` : '';
  }
  function placeCard(r, a, C) {
    const price = TG.known(r.priceLevel) ? r.priceLevel : '';
    const meta = [TG.catLabel(r), TG.known(r.neighbourhood) ? r.neighbourhood : '', price].filter(Boolean).map(esc).join(' · ');
    const w = r._w || {}, o = TG.openState(r), nowish = !a.when || a.when === 'now' || a.when === 'today' || a.when === 'tonight' || a.when === 'd:' + C.iso;
    let when = '';
    if (a.when && a.when !== 'now' && w.days && w.days.length) when = w.days.map(d => `${DAY[d.dow]} ${ivText(d.iv)}`).join(' · ');
    else if (a.when && w.s === 'unknown') when = 'Hours not confirmed';
    const isRest = r.group === 'restaurants';
    const dl = dietLabel(r), diet = DIET_ON(a) || FULLY(r) ? (dl ? `<span class="badge veg lv-${esc(r.veggieLevel)}">${esc(dl)}</span>` : '<span class="badge qz-nodiet">No confirmed veggie options</span>') : '';
    const foot = APP.bookOn(r) ? APP.booking(r) : isRest && r.reservation_url ? `<span class="ext resv" data-href="${esc(r.reservation_url)}" role="link" tabindex="0" aria-label="Reserve at ${esc(r.name)} (opens booking page)">Reserve</span>` : '';
    return `<a class="qz-card bw-host" href="${APP.detailUrl(r.id)}">
      <span class="qz-card__thumb">${TG.thumb(r, '64px')}</span>
      <span class="qz-card__body"><span class="qz-card__top">${nowish || (o.state === 'open' && !isPick(a.when)) ? TG.openLabel(o) : ''}${TG.badges(r, { max: 1, noVeg: true })}${diet}</span>
        <span class="qz-card__name">${esc(r.name)}${TG.scoreBadge(r)}</span><span class="qz-card__meta">${meta}</span>
        ${when ? `<span class="qz-card__when">${esc(when)}</span>` : ''}${foot ? `<span class="qz-card__foot">${foot}</span>` : ''}</span></a>`;
  }
  function evCard(e) {
    const d = `<span>${esc(shortDate(e.dateStart))}</span>` + (e.dateEnd && e.dateEnd !== e.dateStart ? `<span>– ${esc(shortDate(e.dateEnd))}</span>` : '');
    const href = e.restaurantIds.length ? APP.detailUrl(e.restaurantIds[0]) : (e.sources || [])[0] || '#events';
    const ext = !e.restaurantIds.length && /^https?:/.test(href);
    return `<a class="qz-card qz-card--ev" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>
      <span class="qz-card__date">${d}</span>
      <span class="qz-card__body"><span class="qz-card__meta qz-card__type">${esc(e.type)}</span><span class="qz-card__name">${esc(e.title)}</span>
        <span class="qz-card__meta">${esc(e.location || e.restaurantNames.join(', '))}</span></span></a>`;
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-qz-close]')) { close(); return; }
    const bk = t.closest('.bk'); if (bk) { e.preventDefault(); if (bk.dataset.tel) location.href = bk.dataset.tel; else window.open(bk.dataset.href, '_blank', 'noopener'); return; }
    const x = t.closest('.qz-card .ext'); if (x) { e.preventDefault(); window.open(x.dataset.href, '_blank', 'noopener'); return; }
    if (t.closest('[data-qz-back]')) {
      if (!st.mood) return;
      st.pick = null; st.step--; while (st.step >= 0 && st.skipped[st.step]) st.step--;
      if (st.step < 0) { st.mood = ''; st.a = {}; st.step = 0; }
      draw(); return;
    }
    if (t.closest('[data-qz-restart]')) { restart(); return; }
    const dd = t.closest('[data-qz-day]'); if (dd) { st.pick.iso = dd.dataset.qzDay; redrawCal(`[data-qz-day="${st.pick.iso}"]`); return; }
    const mm = t.closest('[data-qz-month]'); if (mm) { st.pick.month = addMonth(st.pick.month, +mm.dataset.qzMonth); redrawCal(`[data-qz-month="${mm.dataset.qzMonth}"]:not([disabled]), .qz-cal__d:not([disabled])`); return; }
    if (t.closest('[data-qz-date-go]')) { const q = st.steps[st.step]; st.a[q.id] = 'd:' + st.pick.iso; st.pick = null; clearAfter(); st.step++; draw(); return; }
    const all = t.closest('[data-qz-all]');
    if (all) { const v = all.dataset.qzAll; close(); if (v === 'events') APP.showEvents(st.a.ekind === 'night' ? 'night' : ''); else APP.show(JSON.parse(v)); return; }
    if (t.closest('[data-qz-skip]')) { const q = st.steps[st.step]; st.a[q.id] = ''; st.pick = null; clearAfter(); st.step++; draw(); return; }
    const b = t.closest('.qz-opt'); if (!b) return;
    if (b.dataset.v === 'pick') {                                          // open (or close) the calendar in place
      const C = clock(), cur = st.a[b.dataset.q];
      st.pick = st.pick ? null : { iso: isPick(cur) ? cur.slice(2) : '', month: (isPick(cur) ? cur.slice(2) : C.iso).slice(0, 7) };
      draw(); return;
    }
    st.pick = null;
    if (b.dataset.q === 'mood') {
      if (st.mood !== b.dataset.v) st.a = {};
      st.mood = b.dataset.v; st.steps = SECTIONS[st.mood].questions; st.step = 0; st.skipped = {};
    } else { st.a[b.dataset.q] = b.dataset.v; clearAfter(); st.step++; }
    b.setAttribute('aria-pressed', 'true');
    setTimeout(draw, 120);                                                 // brief pressed state, then the next question
  }
  function clearAfter() { st.steps.slice(st.step + 1).forEach((q, j) => { delete st.a[q.id]; delete st.skipped[st.step + 1 + j]; }); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-quiz-open]'); if (b) { e.preventDefault(); open(b.dataset.quizMood || undefined); } });

  /* ---------- hero speech bubble: the first question (+ the first 3 answers as chips) right under the Find my table button ----------
     Built once the city's data is loaded (answers = this city's own non-empty moods). Whole bubble opens the quiz; a chip opens it
     with that answer chosen (question 2). The hero hint stays in the DOM for aria-describedby but is visually replaced (.has-bubble). */
  const BUBBLE_CHIPS = 3;
  ready.then(app => {
    APP = APP || app;
    const btns = document.querySelector('.hero__btns'), cta = btns && btns.closest('.hero__cta');
    if (!btns || document.querySelector('.fmt-bubble')) return;
    const opts = moodOpts(clock()).slice(0, BUBBLE_CHIPS);
    const el = document.createElement('div');
    el.className = 'fmt-bubble'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', `Find my table – first question: ${MOOD_Q.q}`);
    el.innerHTML = `<button class="fmt-bubble__q" type="button" data-quiz-open aria-haspopup="dialog" aria-label="${esc(`Find my table: ${MOOD_Q.q} Start the quiz`)}">${esc(MOOD_Q.q)}</button>`
      + (opts.length ? `<span class="fmt-bubble__opts">${opts.map(o => `<button class="fmt-bubble__chip" type="button" data-quiz-open data-quiz-mood="${esc(o.v)}" aria-haspopup="dialog" aria-label="${esc(`Find my table: ${o.l}`)}">${esc(o.l)}</button>`).join('')}<span class="fmt-bubble__more" aria-hidden="true">…</span></span>` : '');
    // a click on the bubble itself (padding, tail) = the question button
    el.addEventListener('click', e => { if (!e.target.closest('button')) el.querySelector('.fmt-bubble__q').click(); });
    btns.insertAdjacentElement('afterend', el);
    // the tail points at the middle of the Find my table button, wherever the button wraps to
    const fmt = btns.querySelector('.pill-btn--quiz');
    const aim = () => { const b = fmt.getBoundingClientRect(), r = el.getBoundingClientRect(); if (!r.width) return;
      el.style.setProperty('--tail-x', `${Math.round(Math.min(r.width - 18, Math.max(18, b.left + b.width / 2 - r.left)))}px`); };
    if (fmt) { aim(); addEventListener('resize', aim, { passive: true }); }
    if (cta) cta.classList.add('has-bubble');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  });
  window.TGQuiz = { open, close, firstQuestion: () => MOOD_Q.q };
})();
