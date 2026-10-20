/* Opening hours → "open now" – Table and the City
   Parses the two formats in the data, strictly:
   - OpenStreetMap opening_hours ("Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off", "24/7", "Mo,We-Su 12:00-14:00,17:30-22:00; Tu off")
   - our curated text ("Mon closed · Tue–Sat 18:00–22:00 · Sun closed", "Mon–Fri 08:00–17:30; Sat–Sun and holidays 09:00–17:30")
   Anything not understood with confidence (month/date rules, "Su[1]", comments, "from 12:00", "dinner", "seasonal", conditions in
   brackets…) → the whole string is unknown. Never guessed. Always evaluated in Europe/Brussels time.
   Days: OSM semantics – a day not covered by any rule is closed. Curated text – a day not mentioned is UNKNOWN.
   Overnight: 18:00-02:00 on Fri is open on Sat 00:00–02:00. Extended times (Fr 11:00-26:00) work the same way.
   Public holidays (PH / "holidays"): rules are ignored; on a Belgian public holiday a schedule that mentions them is unknown.
   Open end ("18:00+"): open is never claimed after the start, and such a schedule is never reported as closed. */
(function (root) {
  'use strict';
  const TZ = 'Europe/Brussels';
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const OSM_D = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
  const CUR_D = { mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6 };
  const fail = reason => ({ ok: false, reason });
  const range = (a, b) => { const out = []; for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; } return out; };   // Fr-Tu wraps
  /* "HH:MM-HH:MM" → interval in minutes from the start of the day; end ≤ start = overnight; up to 48:00 */
  function span(a, b) {
    const t = x => { const m = /^(\d{1,2})[:.](\d{2})$/.exec(x); if (!m || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; };
    const s = t(a), e0 = t(b); if (s == null || e0 == null || s >= 1440 || e0 > 2880) return null;
    const e = e0 <= s ? e0 + 1440 : e0; if (e === s || e - s > 1440) return null;
    return { s, e };
  }

  /* ---------- OpenStreetMap opening_hours (subset; everything else fails) ---------- */
  const OSM_DAYSEL = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\\s*-\\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?';
  const OSM_SEL = new RegExp(`^${OSM_DAYSEL}(?:\\s*,\\s*${OSM_DAYSEL})*$`);
  const OSM_TIME = /^(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?(\+)?$/;
  function parseOsm(str) {
    const src = String(str).trim();
    if (/^24\/7$/.test(src)) return { ok: true, format: 'osm', days: Array.from({ length: 7 }, () => [{ s: 0, e: 1440 }]), ph: false, openEnd: false };
    if (/["\[\]|]|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|SH|week|easter|sunrise|sunset|dawn|dusk|unknown|open)\b|\b\d{4}\b/i.test(src)) return fail('unsupported OSM rule (dates, months, comments or special values)');
    if (!/^[\sMTWFSPHouehrau0-9:,;+\-]*$/.test(src.replace(/off|closed/g, ''))) return fail('unexpected characters');
    const days = Array(7).fill(undefined);
    let ph = false, openEnd = false, any = false;
    for (const rule0 of src.split(';')) {
      const rule = rule0.trim(); if (!rule) continue;
      // "Mo-Fr 11:30-14:00,17:30-22:00, Sa 12:00-14:30" – a comma after a time starts an additional rule
      const parts = rule.split(/(?<=[\d+]|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/);
      for (let pi = 0; pi < parts.length; pi++) {
        const m = /^(?:([A-Za-z][A-Za-z,\s-]*?)\s+)?((?:\d|off$|closed$).*)$/.exec(parts[pi].trim());
        if (!m) return fail(`rule without times: "${parts[pi].trim()}"`);
        const sel = (m[1] || '').trim(), body = m[2].trim();
        let list = [0, 1, 2, 3, 4, 5, 6];
        if (sel) {
          if (!OSM_SEL.test(sel)) return fail(`bad day selector: "${sel}"`);
          const set = new Set(); let onlyPh = true;
          for (const it of sel.split(/\s*,\s*/)) {
            if (it === 'PH') { ph = true; continue; }
            onlyPh = false;
            const [a, b] = it.split(/\s*-\s*/).map(x => OSM_D[x.toLowerCase()]);
            (b == null ? [a] : range(a, b)).forEach(d => set.add(d));
          }
          if (onlyPh) continue;                                        // PH-only rule: ignored
          list = [...set];
        }
        let iv = [];
        if (!/^(off|closed)$/.test(body)) {
          for (const t of body.split(/\s*,\s*/)) {
            const x = OSM_TIME.exec(t); if (!x) return fail(`bad time: "${t}"`);
            if (!x[2] && !x[3]) return fail(`time without end: "${t}"`);
            if (x[2]) { const sp = span(x[1], x[2]); if (!sp) return fail(`bad range: "${t}"`); iv.push(sp); if (x[3]) { iv.push({ s: sp.e % 1440, e: null, openEnd: true, wrap: sp.e >= 1440 }); openEnd = true; } }
            else { const sp = span(x[1], '23:59'); if (!sp) return fail(`bad time: "${t}"`); iv.push({ s: sp.s, e: null, openEnd: true }); openEnd = true; }
          }
        }
        const additional = pi > 0;
        list.forEach(d => { days[d] = additional ? (days[d] || []).concat(iv) : iv.slice(); });
        any = true;
      }
    }
    if (!any) return fail('no usable rule');
    return { ok: true, format: 'osm', days: days.map(d => d || []), ph, openEnd };
  }

  /* ---------- curated text ---------- */
  const SAFE_PAREN = /^(as reported by|as shown on|hln\b|no reservations|dinner from|kitchen\b|last order|private hire\)?$)/;
  const DAYW = '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
  const DAYITEM = `(?:${DAYW}(?:\\s*-\\s*${DAYW})?|daily|every day|weekdays|weekends?|(?:public )?holidays)`;
  const DAYLIST = `${DAYITEM}(?:\\s*(?:,|and|&)\\s*${DAYITEM})*`;
  const RANGE = '(?:\\d{1,2}[:.]\\d{2}\\s*-\\s*\\d{1,2}[:.]\\d{2}|from \\d{1,2}[:.]\\d{2} to \\d{1,2}[:.]\\d{2})';
  const TIMES = `(?:closed|unknown|${RANGE}(?:\\s*(?:,|and|&)\\s*${RANGE})*)`;
  const SEG = new RegExp(`^(?:(closed)\\s+(${DAYLIST})|(${DAYLIST})\\s+(${TIMES})|(${DAYLIST})\\s*:\\s*(${TIMES}))$`);
  function curDays(txt, flags) {
    const out = new Set();
    for (const it of txt.split(/\s*(?:,|\band\b|&)\s*/)) {
      if (/^(public )?holidays$/.test(it)) { flags.ph = true; continue; }
      if (it === 'daily' || it === 'every day') [0, 1, 2, 3, 4, 5, 6].forEach(d => out.add(d));
      else if (it === 'weekdays') [0, 1, 2, 3, 4].forEach(d => out.add(d));
      else if (/^weekends?$/.test(it)) [5, 6].forEach(d => out.add(d));
      else { const [a, b] = it.split(/\s*-\s*/).map(x => CUR_D[x]); if (a == null || (it.includes('-') && b == null)) return null; (b == null ? [a] : range(a, b)).forEach(d => out.add(d)); }
    }
    return [...out];
  }
  function parseCurated(str) {
    let s = String(str).toLowerCase().replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    // harmless notes in brackets (source, kitchen times, "no reservations") are dropped; any other bracket = condition → unknown
    let bad = null;
    s = s.replace(/\s*\(([^()]*)\)/g, (_, inner) => { if (!SAFE_PAREN.test(inner.trim())) bad = inner; return ''; });
    if (bad != null) return fail(`condition in brackets: "(${bad})"`);
    if (/[()]/.test(s)) return fail('unbalanced brackets');
    s = s.replace(/^open /, '');
    const days = Array(7).fill(undefined), flags = { ph: false };
    let any = false;
    for (const seg0 of s.split(/\s*[·;|]\s*/)) {
      for (const seg of seg0.split(/(?<=\d)\s*,\s*(?=(?:mon|tue|wed|thu|fri|sat|sun|daily|weekdays|weekends?)\b)/)) {
        const t = seg.trim().replace(/[.,]$/, '');
        if (!t || /^kitchen\b/.test(t) || t === 'daily') continue;         // kitchen times / a bare "Daily" add nothing
        const m = SEG.exec(t); if (!m) return fail(`not understood: "${seg.trim()}"`);
        const dayTxt = m[2] || m[3] || m[5], body = m[1] ? 'closed' : (m[4] || m[6]);
        const list = curDays(dayTxt, flags); if (!list) return fail(`bad days: "${dayTxt}"`);
        let iv;
        if (body === 'closed') iv = [];
        else if (body === 'unknown') iv = null;
        else {
          iv = [];
          for (const r of body.split(/\s*(?:,|\band\b|&)\s*/)) {
            const x = /^(?:from )?(\d{1,2}[:.]\d{2})\s*(?:-|to)\s*(\d{1,2}[:.]\d{2})$/.exec(r); if (!x) return fail(`bad range: "${r}"`);
            const sp = span(x[1], x[2]); if (!sp) return fail(`bad range: "${r}"`); iv.push(sp);
          }
        }
        for (const d of list) {
          if (days[d] !== undefined && JSON.stringify(days[d]) !== JSON.stringify(iv)) return fail(`conflicting hours for ${DAY_NAMES[d]}`);
          days[d] = iv;
        }
        any = true;
      }
    }
    if (!any) return fail('no hours found');
    return { ok: true, format: 'text', days: days.map(d => d === undefined ? null : d), ph: flags.ph, openEnd: false };
  }

  const CACHE = new Map();
  /* parse(str) → { ok:true, days:[7 × (null = unknown | [{s,e}])], ph, openEnd } | { ok:false, reason } */
  function parse(str) {
    if (str == null || typeof str !== 'string' || !str.trim()) return fail('no hours');
    if (CACHE.has(str)) return CACHE.get(str);
    let r = /\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/.test(str) || /^\s*\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(str) || /^24\/7$/.test(str.trim()) ? parseOsm(str) : parseCurated(str);
    if (!r.ok && !/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/.test(str)) { const o = parseOsm(str); if (o.ok) r = o; }
    if (r.ok && r.days.every(d => d === null)) r = fail('all days unknown');
    CACHE.set(str, r);
    return r;
  }

  /* ---------- Europe/Brussels clock + Belgian public holidays ---------- */
  const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function brussels(date = new Date()) {
    const p = Object.fromEntries(FMT.formatToParts(date).map(x => [x.type, x.value]));
    const dow = DAY_NAMES.indexOf(p.weekday.slice(0, 3));
    return { iso: `${p.year}-${p.month}-${p.day}`, dow, mins: (+p.hour % 24) * 60 + +p.minute };
  }
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const PHY = {};
  function holidays(y) {
    if (PHY[y]) return PHY[y];
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    return (PHY[y] = new Set([`${y}-01-01`, addDays(easter, 1), `${y}-05-01`, addDays(easter, 39), addDays(easter, 50), `${y}-07-21`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`]));
  }
  const isHoliday = iso => holidays(+iso.slice(0, 4)).has(iso);
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /* evaluate(parsed, date) → { state:'open'|'closed'|'unknown', closesAt?, opensAt?: {dayOffset, dow, time} } */
  function evaluate(P, date = new Date()) {
    if (!P || !P.ok) return { state: 'unknown' };
    const { iso, dow, mins } = brussels(date);
    const prevDow = (dow + 6) % 7, today = P.days[dow], prev = P.days[prevDow];
    if (P.ph && (isHoliday(iso) || (mins < 720 && isHoliday(addDays(iso, -1))))) return { state: 'unknown' };
    const hit = (today || []).find(x => x.e != null && x.s <= mins && mins < x.e) || (prev || []).find(x => x.e != null && x.e > 1440 && mins + 1440 < x.e);
    if (hit) return { state: 'open', closesAt: hhmm(hit.e) };
    if (today === null) return { state: 'unknown' };
    if (prev === null && mins < 600) return { state: 'unknown' };          // yesterday unknown: may still be open after midnight
    if (P.openEnd) return { state: 'unknown' };                            // open end: never claim closed
    // next opening (stops at an unknown day or a holiday the hours mention)
    for (let k = 0; k <= 7; k++) {
      const d = (dow + k) % 7, iv = P.days[d];
      if (iv === null || (P.ph && isHoliday(addDays(iso, k)))) break;
      const s = iv.filter(x => k > 0 || x.s > mins).map(x => x.s).sort((a, b) => a - b)[0];
      if (s != null) return { state: 'closed', opensAt: { dayOffset: k, dow: d, time: hhmm(s) } };
    }
    return { state: 'closed' };
  }
  const status = (str, date) => evaluate(parse(str), date);
  const opensText = o => !o ? '' : o.dayOffset === 0 ? o.time : o.dayOffset === 1 ? `tomorrow ${o.time}` : `${DAY_NAMES[o.dow]} ${o.time}`;
  const API = { parse, evaluate, status, brussels, holidays, isHoliday, opensText, DAY_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TGHours = API;
})(typeof window !== 'undefined' ? window : globalThis);
