/* Table and the City – UI language (en default · nl · de · fr · es).
   Language: ?lang=xx (then remembered in localStorage) → saved choice → English. The browser language is never applied automatically.
   Dictionaries (js/i18n/<lang>.js) are keyed by the English UI text ('{n} places in {city}' style templates for dynamic strings);
   anything missing stays English. The page code keeps writing English; this file translates the rendered UI text, placeholders,
   titles and aria-labels (and keeps doing so as the page re-renders), and never touches restaurant names, addresses or curated text. */
(function () {
  'use strict';
  var LANGS = { en: 'English', nl: 'Nederlands', de: 'Deutsch', fr: 'Français', es: 'Español' };
  var KEY = 'tatc-lang', qs = new URLSearchParams(location.search), q = (qs.get('lang') || '').toLowerCase(), lang = 'en';
  try { if (LANGS[q]) { lang = q; localStorage.setItem(KEY, q); } else if (LANGS[localStorage.getItem(KEY)]) lang = localStorage.getItem(KEY); } catch (e) { if (LANGS[q]) lang = q; }
  var I = window.TG_I18N = window.TG_I18N || { dicts: {} };
  I.lang = lang; I.langs = LANGS;
  document.documentElement.lang = lang;
  if (lang !== 'en') {                                    // the dictionary loads before the page scripts, so the first paint is already translated where possible
    var bm = document.querySelector('meta[name="build"]'), v = bm ? '?v=' + bm.content : '';
    document.write('<script src="js/i18n/' + lang + '.js' + v + '"><\/script>');
    document.documentElement.classList.add('i18n-pending');
    setTimeout(function () { document.documentElement.classList.remove('i18n-pending'); }, 2500);   // never keep the page hidden
  }
  function D() { return (I.dicts && I.dicts[lang]) || {}; }
  function fill(s, vars) { return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }) : s; }
  /* t('Open now') / t('{n} places in {city}', {n: 5, city: 'Ghent'}) → translated (or English) text */
  function t(key, vars) { var d = D(), s = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key; return fill(s, vars); }
  function has(key) { return lang !== 'en' && Object.prototype.hasOwnProperty.call(D(), key); }
  I.t = t;

  /* ---------- dynamic strings: [regex, template key, names of the groups] (groups named city/x/day/date are translated too) ---------- */
  var MON = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec', DAYS = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun';
  var MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
  var WEEK = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
  var P = [
    [/^([\d,.]+) places in (.+)$/, '{n} places in {city}', ['n', 'city']],
    [/^([\d,.]+) places?$/, '{n} places', ['n']],
    [/^([\d,.]+) results?$/, '{n} results', ['n']],
    [/^([\d,.]+) match(?:es)?$/, '{n} matches', ['n']],
    [/^([\d,.]+) cuisines$/, '{n} cuisines', ['n']],
    [/^([\d,.]+) cities$/, '{n} cities', ['n']],
    [/^(.+): ([\d,.]+) cities$/, '{x}: {n} cities', ['x', 'n']],
    [/^([\d,.]+) upcoming$/, '{n} upcoming', ['n']],
    [/^([\d,.]+) upcoming events & collaborations$/, '{n} upcoming events & collaborations', ['n']],
    [/^([\d,.]+) fully vegan · ([\d,.]+) vegetarian · ([\d,.]+) with veggie options$/, '{a} fully vegan · {b} vegetarian · {c} with veggie options', ['a', 'b', 'c']],
    [/^All places in (.+)$/, 'All places in {city}', ['city']],
    [/^Live music in (.+)$/, 'Live music in {city}', ['city']],
    [/^(.+) restaurants in (.+)$/, '{x} restaurants in {city}', ['x', 'city']],
    [/^All (.+), ([\d,.]+)$/, 'All {x}, {n}', ['x', 'n']],
    [/^([\d,.]+) photos$/, '{n} photos', ['n']],
    [/^All ([\d,.]+)$/, 'All {n}', ['n']],
    [/^View all ([\d,.]+)$/, 'View all {n}', ['n']],
    [/^Show more \(([\d,.]+) of ([\d,.]+) more\)$/, 'Show more ({a} of {b} more)', ['a', 'b']],
    [/^\+([\d,.]+) · ([\d,.]+) more$/, '+{a} · {b} more', ['a', 'b']],
    [new RegExp('^New since (' + MONTHS + ') (\\d{4})$'), 'New since {date}', ['date', 'y'], function (m) { return { date: t(m[1]) + ' ' + m[2] }; }],
    [new RegExp('^(' + MONTHS + ') (\\d{4})$'), '{x} {y}', ['x', 'y']],
    [/^Opening soon · (.+)$/, 'Opening soon · {x}', ['x']],
    [/^· until (.+)$/, '· until {x}', ['x']],
    [/^Opens (.+)$/, 'Opens {date}', ['date']],
    [/^Closed · opens (.+)$/, 'Closed · opens {date}', ['date']],
    [/^Open now · (.+)$/, 'Open now · {x}', ['x']],
    [/^from €(.+)$/, 'from €{n}', ['n']],
    [/^From (.+)$/, 'From {date}', ['date']],
    [/^Any day until (.+)$/, 'Any day until {date}', ['date']],
    [/^Last changed (.+)$/, 'Last changed {date}', ['date']],
    [/^Coordinates: (.+)$/, 'Coordinates: {raw}', ['raw']],
    [/^Hours: (.+)$/, 'Hours: {raw}', ['raw']],
    [/^Photo: (.+)$/, 'Photo: {raw}', ['raw']],
    [/^(.+) · ([\d,.]+) of ([\d,.]+)$/, '{x} · {a} of {b}', ['x', 'a', 'b']],
    [/^(.+) · your picks$/, '{x} · your picks', ['x']],
    [/^Show all ([\d,.]+) match(?:es)?$/, 'Show all {n} matches', ['n']],
    [/^All ([\d,.]+) upcoming events$/, 'All {n} upcoming events', ['n']],
    [/^Only ([\d,.]+) exact match(?:es)? — we relaxed “(.+)”\.$/, 'Only {n} exact matches — we relaxed “{x}”.', ['n', 'x']],
    [/^Nothing on (.+) — here are the nearest events\.$/, 'Nothing on {date} — here are the nearest events.', ['date']],
    [/^Only ([\d,.]+) on (.+) — nearest dates added\.$/, 'Only {n} on {date} — nearest dates added.', ['n', 'date']],
    [/^Find my table in (.+)$/, 'Find my table in {city}', ['city']],
    [/^Find my table – first question: (.+)$/, 'Find my table – first question: {x}', ['x']],
    [/^Directions to (.+) in Google Maps \(new tab\)$/, 'Directions to {raw} in Google Maps (new tab)', ['raw']],
    [/^Features \(([\d,.]+) confirmed\)$/, 'Features ({n} confirmed)', ['n']],
    [/^(.+): not sure$/, '{x}: not sure', ['x']],
    [/^:? ?Confirmed — (.+)$/, 'Confirmed — {raw}', ['raw'], null, true],
    [/^(.+) · coming soon$/, '{x} · coming soon', ['x']],
    [/^(.+), coming soon$/, '{x}, coming soon', ['x']],
    [/^(.+) — coming soon$/, '{x} — coming soon', ['x']],
    [/^Continue to (.+)$/, 'Continue to {city}', ['city']],
    [/^Distance from (.+)$/, 'Distance from {x}', ['x']],
    [/^Reserve at (.+) \(opens booking page\)$/, 'Reserve at {raw} (opens booking page)', ['raw']],
    [/^Table and the City — (.+): restaurants, cafés, coffee & bakeries$/, 'Table and the City — {city}: restaurants, cafés, coffee & bakeries', ['city']],
    [/^(.+) — (Ghent|Antwerp|Bruges|Ostend|Brussels) — Table and the City$/, '{raw} — {city} — Table and the City', ['raw', 'city']],
    [/^(Ghent|Antwerp|Bruges|Ostend|Brussels) — Table and the City$/, '{city} — Table and the City', ['city']]
  ];
  var TOK = new RegExp('^(?:(?:' + DAYS + '|' + MON + '|' + WEEK + '|closed|Closed|Daily|and holidays|Mo|Tu|We|Th|Fr|Sa|Su)\\b|[\\d:.,;·–\\- ])+$');
  var TOKS = new RegExp('\\b(' + WEEK + '|' + DAYS + '|' + MON + '|closed|Closed|Daily|and holidays)\\b', 'g');
  function tokens(s) { return s.replace(TOKS, function (w) { return t(w); }); }
  function one(s) {                                       // translate one trimmed string, or return null when nothing applies
    if (has(s)) return t(s);
    if (/^: /.test(s) && has(s.slice(2))) return ': ' + t(s.slice(2));
    if (/\d/.test(s) && TOK.test(s) && /[A-Za-z]/.test(s)) { var r = tokens(s); return r !== s ? r : null; }
    for (var i = 0; i < P.length; i++) {
      var p = P[i], m = s.match(p[0]); if (!m) continue;
      if (!has(p[1])) return null;
      var vars = p[3] ? p[3](m) : {};
      p[2].forEach(function (k, j) { if (vars[k] != null) return; var g = m[j + 1];
        vars[k] = (k === 'n' || k === 'a' || k === 'b' || k === 'c' || k === 'y' || k === 'raw') ? g : k === 'date' ? tokens(g) : (one(g) || g); });
      var out = fill(t(p[1]), vars); return p[4] && /^:/.test(s) ? ': ' + out : out;
    }
    if (s.indexOf(' · ') > 0) {                            // "Fine dining · Modern · Prinsenhof · €€€€": translate the parts we know
      var parts = s.split(' · '), ch = false;
      parts = parts.map(function (x) { var y = one(x); if (y != null && y !== x) { ch = true; return y; } return x; });
      if (ch) return parts.join(' · ');
    }
    return null;
  }
  I.tr = function (s) { var r = one(String(s).trim()); return r == null ? s : r; };

  /* ---------- the DOM pass ---------- */
  var SKIP = '[data-i18n-skip], script, style, .card h3, .qz-card__name, .ev__title, .ev__meta, .ev__desc, .ev__type, .qz-card__type, #hname, .summary, .sources, .changelog, #about-text, .quote, .credit, .pill-credit, .wl-card__tag, .ws-cap, .leaflet-popup-content b, .leaflet-popup-content strong, .resv-note, .dmap-cap, .lb__fig figcaption, textarea, .langsel';
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'], seen = new WeakMap();
  function textNode(n) {
    var v = n.nodeValue; if (seen.get(n) === v) return;
    var s = v.trim(); if (!s || !/[A-Za-z]/.test(s)) return;
    var p = n.parentElement; if (!p || p.closest(SKIP)) { seen.set(n, v); return; }
    var r = one(s); if (r != null && r !== s) { v = v.replace(s, r); n.nodeValue = v; }
    seen.set(n, v);
  }
  function attrs(el) {
    if (el.closest(SKIP) && !el.matches('.langsel *')) return;
    for (var i = 0; i < ATTRS.length; i++) { var a = ATTRS[i], v = el.getAttribute(a); if (!v || !/[A-Za-z]/.test(v)) continue;
      if (a === 'alt' && !el.matches('.logo__img')) continue;
      var r = one(v.trim()); if (r != null && r !== v) el.setAttribute(a, r); }
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches('script, style')) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n; while ((n = w.nextNode())) textNode(n);
    attrs(root); var els = root.querySelectorAll('[placeholder], [title], [aria-label], img.logo__img'); for (var i = 0; i < els.length; i++) attrs(els[i]);
  }
  function title() { var s = document.title, r = one(s); if (r != null && r !== s) document.title = r; }
  var busy = false;
  function start() {
    switcher();
    if (lang === 'en' || !I.dicts[lang]) { document.documentElement.classList.remove('i18n-pending'); return; }
    walk(document.body); title();
    var md = document.querySelector('meta[name="description"]'); if (md) { var r = one(md.content); if (r) md.content = r; }
    document.documentElement.classList.remove('i18n-pending');
    new MutationObserver(function (ms) {
      if (busy) return; busy = true;
      try { ms.forEach(function (m) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') attrs(m.target);
      }); } finally { busy = false; }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var te = document.querySelector('title'); if (te) new MutationObserver(title).observe(te, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- links keep the language; the switcher ---------- */
  function withLang(href, l) { var u = new URL(href, location.href); if (l === 'en') u.searchParams.delete('lang'); else u.searchParams.set('lang', l); return u; }
  document.addEventListener('click', function (e) {
    if (lang === 'en' || e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.closest('.langsel')) return;
    var u = new URL(a.getAttribute('href'), location.href);
    if (u.origin !== location.origin || !/(\/|\.html)$/.test(u.pathname) || u.searchParams.has('lang')) return;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return;   // in-page anchors
    u.searchParams.set('lang', lang); a.href = u.href;
  }, true);
  function switcher() {
    var host = document.querySelector('.topbar__right, .wl-top__right'); if (!host || host.querySelector('.langsel')) return;
    var box = document.createElement('div'); box.className = 'langsel'; box.setAttribute('data-i18n-skip', '');
    var label = t('Language');
    box.innerHTML = '<button type="button" class="langsel__btn" aria-haspopup="true" aria-expanded="false" aria-label="' + label + ': ' + LANGS[lang] + '">' + lang.toUpperCase() +
      '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg></button><ul class="langsel__menu" hidden>' +
      Object.keys(LANGS).map(function (l) { var u = withLang(location.href, l); u.searchParams.set('lang', l);
        return '<li><a href="' + u.pathname + u.search + u.hash + '" lang="' + l + '"' + (l === lang ? ' aria-current="true"' : '') + '><b>' + l.toUpperCase() + '</b>' + LANGS[l] + '</a></li>'; }).join('') + '</ul>';
    var before = host.querySelector('.menu-btn, .wl-listbtn'); host.insertBefore(box, before || null);
    var btn = box.firstChild, menu = box.lastChild;
    function set(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(menu.hidden); });
    menu.addEventListener('click', function (e) { var a = e.target.closest('a'); if (!a) return; e.preventDefault();
      var l = a.getAttribute('lang'); try { localStorage.setItem(KEY, l); } catch (x) {} location.href = withLang(location.href, l).href; });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
