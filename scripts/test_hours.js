#!/usr/bin/env node
/* Tests for js/hours.js (opening hours → open now, Europe/Brussels).  Run: node scripts/test_hours.js
   Also run it with a foreign TZ (e.g. TZ=America/Los_Angeles node scripts/test_hours.js): results must not change. */
const H = require('../js/hours.js');
const fs = require('fs'), path = require('path');
let n = 0, bad = 0;
const eq = (got, want, msg) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { bad++; console.log(`FAIL ${msg}\n   got  ${g}\n   want ${w}`); } };
// Brussels wall-clock → Date (CEST = UTC+2 until 25 Oct 2026 03:00, then CET = UTC+1)
const at = (iso, hm) => { const d = new Date(`${iso}T${hm}:00Z`); const off = H.brussels(d).mins - (+hm.slice(0, 2) * 60 + +hm.slice(3)); return new Date(d - (((off + 720) % 1440 + 1440) % 1440 - 720) * 6e4); };
const st = (h, iso, hm) => H.status(h, at(iso, hm));
const S = (h, iso, hm) => st(h, iso, hm).state;
// 2026-10-19 Mon, 10-20 Tue, 10-21 Wed, 10-22 Thu, 10-23 Fri, 10-24 Sat, 10-25 Sun

// clock: always Europe/Brussels, whatever the process TZ
eq(H.brussels(new Date('2026-10-20T08:00:00Z')), { iso: '2026-10-20', dow: 1, mins: 600 }, 'CEST: 08:00Z = Tue 10:00 Brussels');
eq(H.brussels(new Date('2026-10-20T22:30:00Z')), { iso: '2026-10-21', dow: 2, mins: 30 }, '22:30Z = Wed 00:30 Brussels (date rolls over)');
eq(H.brussels(new Date('2026-10-25T01:30:00Z')), { iso: '2026-10-25', dow: 6, mins: 150 }, 'after DST end: 01:30Z = Sun 02:30 CET');
eq(H.brussels(new Date('2026-12-01T11:00:00Z')).mins, 720, 'CET: 11:00Z = 12:00');
eq(S('Tu 20:00-23:00', '2026-10-20', '22:00'), 'open', 'evaluated in Brussels time');
eq(H.status('Tu 20:00-23:00', new Date('2026-10-20T21:30:00Z')).state, 'closed', '21:30Z = 23:30 Brussels → closed');

// OSM basics
const W = 'Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off';
eq(st(W, '2026-10-20', '10:00'), { state: 'open', closesAt: '18:00' }, 'weekday open');
eq(st(W, '2026-10-20', '07:59'), { state: 'closed', opensAt: { dayOffset: 0, dow: 1, time: '08:00' } }, 'before opening → opens today');
eq(st(W, '2026-10-20', '18:00'), { state: 'closed', opensAt: { dayOffset: 1, dow: 2, time: '08:00' } }, 'end is exclusive → opens tomorrow');
eq(st(W, '2026-10-24', '15:00').opensAt, { dayOffset: 2, dow: 0, time: '08:00' }, 'Sat after close → Mon (Su off)');
eq(H.opensText(st(W, '2026-10-24', '15:00').opensAt), 'Mon 08:00', 'opens text: weekday');
eq(H.opensText(st(W, '2026-10-20', '19:00').opensAt), 'tomorrow 08:00', 'opens text: tomorrow');
eq(H.opensText(st(W, '2026-10-20', '07:00').opensAt), '08:00', 'opens text: today');
eq(S('Mo-Fr 08:00-15:00', '2026-10-25', '12:00'), 'closed', 'OSM: day not covered = closed');
eq(S('Mo,We-Su 12:00-14:00,17:30-22:00; Tu off', '2026-10-21', '13:00'), 'open', 'comma day list + multiple ranges');
eq(S('Mo,We-Su 12:00-14:00,17:30-22:00; Tu off', '2026-10-21', '15:00'), 'closed', 'gap between ranges');
eq(S('Mo,We-Su 12:00-14:00,17:30-22:00; Tu off', '2026-10-20', '13:00'), 'closed', 'Tu off');
eq(S('Fr-Tu 12:00-21:30; Th 17:30-21:30', '2026-10-25', '13:00'), 'open', 'wrapping day range Fr-Tu includes Su');
eq(S('Fr-Tu 12:00-21:30; Th 17:30-21:30', '2026-10-21', '13:00'), 'closed', 'Fr-Tu excludes We');
eq(S('Tu-Sa 16:00-01:00; Sa 12:00-01:00', '2026-10-24', '13:00'), 'open', '; later rule overrides the day');
eq(S('We-Su 18:00-22:00; Su 11:30-13:30', '2026-10-25', '19:00'), 'closed', '; override replaces (OSM spec)');
eq(S('Mo-Fr 11:30-14:00,17:30-22:00, Sa 12:00-14:30,18:00-22:00', '2026-10-24', '13:00'), 'open', ', additional rule');
eq(S('Mo-Fr 12:00-14:00, Fr 18:00-21:00; PH off', '2026-10-23', '19:00'), 'open', 'additional rule adds a range');
eq(S('Mo-Fr 12:00-14:00, Fr 18:00-21:00; PH off', '2026-10-23', '13:00'), 'open', 'additional rule keeps the earlier range');
eq(S('11:30-14:00, 18:00-21:30', '2026-10-25', '19:00'), 'open', 'times without days = every day');
eq(S('24/7', '2026-10-25', '04:00'), 'open', '24/7');
eq(S('Mo-Su 00:00-24:00', '2026-10-25', '23:59'), 'open', '00:00-24:00');

// overnight
eq(st('Fr 18:00-02:00', '2026-10-24', '01:30'), { state: 'open', closesAt: '02:00' }, 'overnight: Sat 01:30 open via Fri');
eq(S('Fr 18:00-02:00', '2026-10-24', '02:00'), 'closed', 'overnight end exclusive');
eq(S('Fr 18:00-02:00', '2026-10-23', '01:00'), 'closed', 'no spill from Thu');
eq(S('Mo-Su 17:00-03:00', '2026-10-19', '02:00'), 'open', 'Mon 02:00 open via Sun (week wrap)');
eq(S('Mo-Th 11:00-24:00, Fr-Sa 11:00-26:00, Su 11:00-23:00', '2026-10-18', '01:30'), 'open', 'extended time 26:00 = Sun 02:00');
eq(S('Mo-Th 11:00-24:00, Fr-Sa 11:00-26:00, Su 11:00-23:00', '2026-10-18', '02:30'), 'closed', 'after 26:00');
eq(S('Th 17:00-00:00; Fr-Sa 00:00-01:00, 17:00-00:00; Su 00:00-01:00', '2026-10-24', '00:30'), 'open', 'explicit 00:00-01:00');
eq(S('Mon closed · Tue 20:00–00:00 · Wed–Thu 22:00–06:00 · Fri–Sat 22:00–08:00 · Sun closed', '2026-10-25', '07:30'), 'open', 'curated overnight to 08:00 (Sat→Sun)');

// public holidays: rules ignored; on a Belgian PH a schedule that mentions PH is unknown
eq([...H.holidays(2026)].sort(), ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-07-21', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25'], 'Belgian holidays 2026');
eq(H.isHoliday('2027-03-29'), true, 'Easter Monday 2027');
eq(S('Mo-Fr 09:00-15:00; PH off', '2026-11-10', '10:00'), 'open', 'PH rule ignored on a normal day');
eq(S('Mo-Fr 09:00-15:00; PH off', '2026-11-11', '10:00'), 'unknown', 'PH-mentioning schedule on 11 Nov → unknown');
eq(S('Mo-Fr 09:00-15:00', '2026-11-11', '10:00'), 'open', 'no PH rule → normal evaluation');
eq(S('Mo-Th 12:00-21:00; Fr,Sa 12:00-22:00; Su 12:00-21:00; PH 12:00-22:00', '2026-10-20', '13:00'), 'open', 'PH-only rule skipped');
eq(S('Sa,Su,PH 11:30-14:00', '2026-10-24', '12:00'), 'open', 'PH inside a day list is dropped');
eq(st('Mo-Fr 09:00-15:00; PH off', '2026-11-10', '16:00'), { state: 'closed' }, 'next opening on a PH → no "opens" time');
eq(H.parse('PH off').ok, false, 'only PH rules → unknown');
eq(S('Tue–Sat 09:00–18:00; closed Mon, Sun and public holidays', '2026-10-20', '10:00'), 'open', 'curated "closed … and public holidays"');
eq(S('Tue–Sat 09:00–18:00; closed Mon, Sun and public holidays', '2026-11-11', '10:00'), 'unknown', 'curated holiday mention on a PH');
eq(S('Weekdays 08:30–18:00; weekends & holidays 09:30–18:00', '2026-10-25', '10:00'), 'open', 'weekends & holidays');

// open end: never claims closed
eq(S('Mo-Su 11:00+', '2026-10-20', '12:00'), 'unknown', 'open end after start → unknown');
eq(S('Mo-Su 11:00+', '2026-10-20', '09:00'), 'unknown', 'open end schedule never closed');
eq(S('Mo-Fr 11:00-18:00+, PH,Sa,Su 16:00-01:00+', '2026-10-20', '12:00'), 'open', 'bounded part of 11:00-18:00+ is open');
eq(S('Mo-Fr 11:00-18:00+, PH,Sa,Su 16:00-01:00+', '2026-10-20', '19:00'), 'unknown', 'after 18:00+ → unknown');

// curated text
const C = 'Mon closed · Tue–Fri 12:00–13:30, 19:00–22:00 · Sat–Sun closed';
eq(S(C, '2026-10-20', '12:30'), 'open', 'curated lunch');
eq(S(C, '2026-10-20', '15:00'), 'closed', 'curated between services');
eq(H.opensText(st(C, '2026-10-20', '15:00').opensAt), '19:00', 'curated opens tonight');
eq(H.opensText(st(C, '2026-10-23', '23:00').opensAt), 'Tue 12:00', 'curated Fri night → Tue');
eq(S('Mon–Sat 11:30–22:00 · Sun unknown', '2026-10-25', '12:00'), 'unknown', '"Sun unknown" → unknown');
eq(S('Mon–Sat 11:30–22:00 · Sun unknown', '2026-10-19', '09:00'), 'unknown', 'early morning after an unknown day → unknown');
eq(S('Mon–Sat 11:30–22:00 · Sun unknown', '2026-10-19', '12:00'), 'open', 'Mon noon open');
eq(st('Mon–Sat 11:30–22:00 · Sun unknown', '2026-10-24', '23:00'), { state: 'closed' }, 'next day unknown → no opens text');
eq(S('Tue–Sat 10:00–18:00', '2026-10-25', '12:00'), 'unknown', 'curated: day not mentioned = unknown (not closed)');
eq(S('Mon–Thu 22:00–05:00', '2026-10-23', '03:00'), 'open', 'curated Thu night spills into Fri');
eq(S('Mon–Thu 22:00–05:00', '2026-10-23', '06:00'), 'unknown', 'Fri not mentioned → unknown');
eq(S('Open daily from 11:00 to 01:00; kitchen 12:00–14:30 and 17:00–22:00 (as shown on site 2026-10-19)', '2026-10-21', '00:30'), 'open', '"from 11:00 to 01:00", kitchen note ignored');
eq(S('Daily 12:00–15:00 & 18:00–23:00 (HLN, 25 Aug 2026)', '2026-10-20', '16:00'), 'closed', '"&" between ranges, source note');
eq(S('Thu, Fri, Mon 07:00–18:00; Sat 07:00–17:00; Sun 07:00–14:00; Tue–Wed closed (as reported by HLN, Mar 2026)', '2026-10-19', '08:00'), 'open', 'day list "Thu, Fri, Mon"');
eq(S('Mon–Fri 08:00–16:30, weekends 09:00–16:00', '2026-10-24', '10:00'), 'open', 'comma between day groups');
eq(S('Mon–Tue 12:00–13:30 · Wed closed (private hire)', '2026-10-21', '12:00'), 'closed', '"closed (private hire)"');

// strict: anything ambiguous → unknown (parse fails)
['Thu–Sat from 18:00', 'Mon–Fri from 21:00', 'Mon closed · Tue–Wed dinner · Thu–Sat lunch, dinner · Sun closed',
 'Wed–Sat 20:00–02:00; Mon, Tue, Sun closed (extra opening for events)', 'Seasonal — closed in the winter months; weekend brunch in season',
 'Coffee bar Wed–Sun 10:00–18:00', 'Mon–Tue closed · Wed–Sat 18:00–21:30 · Sun first Sunday of the month: lunch only',
 'Th-Mo; Tu-We off', 'Mo-Sa 10:00-13:00,13:30-18:00; PH off; Oct-May Su[1] 14:00-18:00', 'Tu-Fr 10:00-17:00; Sa-Su 10:00-17:30; Dec 25-Jan 4 off',
 'Mo-Sa 12:00-14:30,18:00-22:00; Su 09:00-12:00 "appointment"', 'Tu-Th 12:00-14:00; 2024 Jan 02 off', 'Mo-Fr 12:00', 'Mon 12:00–14:00 · Mon 18:00–22:00',
 'Mo-Fr sunrise-sunset', '', 'unknown', null, 'Daily from 16:00 (closing time not stated); closed on Sunday since 2011'
].forEach(h => { eq(H.parse(h).ok, false, `must not parse: ${JSON.stringify(h)}`); eq(H.status(h).state, 'unknown', `unknown: ${JSON.stringify(h)}`); });

// whole data: never throws; report counts and failures
for (const [f, key] of [['gent', 'restaurants'], ['gent-osm', 'places']]) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cities', f + '.json'), 'utf8'));
  let ok = 0, fail = 0, none = 0;
  for (const r of d[key]) { if (!r.openingHours) { none++; continue; } const p = H.parse(r.openingHours); if (p.ok) { ok++; H.evaluate(p); } else fail++; }
  console.log(`${f}.json: ${d[key].length} places · parseable ${ok} · not parseable ${fail} · no hours ${none}`);
}
console.log(`${n - bad}/${n} passed (process TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
process.exit(bad ? 1 : 0);
