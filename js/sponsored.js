/* Sponsored spots (paid placements), data/sponsored.json → TGSponsor (used by js/app.js on the city guide):
   featured = one card above the city's place list, tile = one card after the 6th place, event = one upcoming event shown first in Events.
   Every spot carries a visible "Sponsored" label (EU consumer law / DSA: ads must be recognisable as ads).
   An entry counts only between its start and end dates (Brussels date, both included), for its own city, when the place exists there,
   is not closed or only announced, and passes the guide's rules (no chains, fast food, pizza, kebab, burgers; see scripts/check_sponsored.py).
   demo: true entries are preview-only: shown only after ?sponsored=demo (kept for the tab in sessionStorage; ?sponsored=off clears it). */
(function () {
  'use strict';
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const KEY = 'tatc-sp-demo';
  let demo = false;
  try {
    const q = new URLSearchParams(location.search).get('sponsored');
    if (q === 'demo') sessionStorage.setItem(KEY, '1'); else if (q === 'off') sessionStorage.removeItem(KEY);
    demo = sessionStorage.getItem(KEY) === '1';
  } catch (e) { demo = new URLSearchParams(location.search).get('sponsored') === 'demo'; }
  /* the guide's rules, as a last check in the browser (the import scripts already keep these off the site) */
  const BANNED = /\b(pizz\w*|kebab|d[öo]ner|d[üu]r[üu]m|shoarma|shawarma|gyros|pitta?|burgers?|fast[ -]?food|fried chicken|chicken wings|hot ?dogs?|mc ?donald'?s?|burger king|kfc|domino'?s|starbucks)\b/i;
  const allowed = r => !!r && !r.upcoming && !r.fromUpcoming && r.status !== 'closed' && r.status !== 'unverified'
    && ![r.name, r.cuisine, r.category, r.type, (r.cuisineTags || []).join(' ')].some(v => v && BANNED.test(String(v)));
  const lang = () => (window.TG_I18N && TG_I18N.lang) || 'en';
  const tagline = e => { const t = e.tagline; if (!t) return ''; if (typeof t === 'string') return t; return t[lang()] || t.en || ''; };
  const day = Math.floor(Date.parse(TODAY + 'T12:00:00Z') / 864e5);
  async function load(city, R) {
    let d = { cities: {} };
    try { const u = window.TG && TG.bust ? TG.bust('data/sponsored.json') : 'data/sponsored.json'; const res = await fetch(u, { cache: 'no-cache' }); if (res.ok) d = await res.json(); } catch (e) {}
    const byId = new Map(R.map(r => [r.id, r]));
    const live = ((d.cities || {})[city.id] || []).filter(e => e && e.id && ['featured', 'tile', 'event'].includes(e.type)
      && /^\d{4}-\d{2}-\d{2}$/.test(e.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(e.end || '') && e.start <= TODAY && TODAY <= e.end
      && (!e.demo || demo) && allowed(byId.get(e.id)))
      .map(e => ({ ...e, place: byId.get(e.id), line: tagline(e) }));
    const one = type => { const xs = live.filter(e => e.type === type); return xs.length ? xs[day % xs.length] : null; };   // several: one per day, in turn
    const featured = one('featured');
    let tile = one('tile'); if (tile && featured && tile.id === featured.id) tile = null;     // never the same place twice
    return { featured, tile, event: one('event'), demo };
  }
  window.TGSponsor = { load, allowed, LABEL: 'Sponsored', NOTE: 'Paid placement' };
})();
