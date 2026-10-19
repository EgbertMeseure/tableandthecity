# Daily update – Table and the City

Goal: update each city's dataset every day without inventing anything. Anything that cannot be
confirmed stays `unknown`. The UI is English; sources are often Dutch (Gent).

## Data layout (multi-city)
- `data/cities.json` – brand, family sites, countries → cities (`id`, `name`, `active`, `data`, `center`, `zoom`).
  Add a city: add its entry (set `active: true` only when its data file is ready) → `?city=<id>`.
- `data/cities/<city>.json` – `{ city, restaurants[], extraEvents[], changelog[] }` (the site reads only this).
  - Per restaurant: `city`, `country`, `dateChecked` (last check), `lastChanged` (last content change),
    `vegetarian`/`vegan` = `yes|no|unknown`, `events[]` (`title, dateStart, dateEnd|dateText, type, location, partners[], sources[], note`),
    `summary` (guide description, kept in original language, `summaryLang`), `original_nl` (Dutch source text of translated fields).
- `data/cities/<city>.csv` – flat export.
- `data/cities/<city>-events-archive.json` – past events moved out by `prune_events.py`.
- `data/photo-pool.json` – stock mood-image pool for galleries.
- `data/source-nl/` – frozen Dutch working data for Gent; `scripts/translate_en.py` rebuilds `data/cities/gent.json` from it
  (then run `assign_photos.py` and `prune_events.py`).
  (Long term: edit `data/cities/gent.json` directly and drop the source-nl step.)

## Daily procedure (± 15–30 min per city)
1. **Change detection** – `python3 scripts/check_changes.py gent`
   Fetches website + menu/event pages (1 req/s), compares hashes with the previous run → `data/pending-changes-gent.json`.
   Review each flagged page; update `currentMenuNote`, `menuType`, `menuChanges`, `vegetarian`/`vegan` (+ `dietNote` with a quote).
   Translate faithfully into English; keep the Dutch text in `original_nl`. JS-heavy sites: `scripts/render_js_sites.py`.
2. **New openings / closures** – web search (current year): `"NET OPEN" Gent restaurant` (HLN), `nieuw restaurant Gent`
   (Nieuwsblad, Made in, De Tijd/Sabato), `sluit de deuren Gent restaurant`.
   Weekly: Michelin list (`scripts/scrape_michelin.py`) and Gault&Millau (`scripts/scrape_gaultmillau.py`).
   New entry: ≥1 reliable source + own website; geocode with `scripts/geocode.py` (Nominatim, own User-Agent, ≤1 req/s);
   `isNew=true` if opened < 18 months ago. Closure: `status` = `temporarily closed` / `permanently closed` + `statusNote`;
   remove permanently closed places after 30 days (keep the changelog entry).
3. **Events & collaborations** – search `four hands Gent`, `4-handendiner Gent`, `gastchef Gent`, `pop-up Gent restaurant`,
   `wijndiner Gent`, plus agendas: visit.gent.be, stad.gent (Gand Gourmand), Fourchette, Red Loft/BROER, Instagram links on
   restaurant sites. Only add with a date + source. No year stated → `dateStart=null`, `dateText="… (year not stated)"`.
4. **Prune past events** – `python3 scripts/prune_events.py gent` moves every event whose end date (or single date) is before
   today (Europe/Brussels), and undated events not marked `ongoing: true` with a future `dateEnd`, to
   `data/cities/gent-events-archive.json` and logs it in the changelog. Rule-based events keep a `recurrence`
   (`{freq:'monthly', nth:2, weekday:6}` = every 2nd Saturday); the site shows only their next occurrence.
   The site also hides past events client-side, so a missed run never shows stale events.
5. **Recompute `isNew`** – set `false` once `openingDate` is older than 18 months.
6. **Distinctions** – replace all scores when a new Michelin (spring) or Gault&Millau (November) edition appears.
7. **Photos** – `python3 scripts/assign_photos.py gent` (re)fills stock mood images; real photos are never overwritten (see README).
8. **Finish** – set `dateChecked` (and `lastChanged` if content changed); add one `changelog` entry per change (with source URL);
   regenerate the CSV; test locally: `python3 -m http.server 8765` → `python3 scripts/screenshots.py` (fails on any console error).

## Frequency
| Task | Frequency |
|---|---|
| Website/menu hash check (1) | daily |
| Press: openings/closures (2) | daily (quick), weekly (thorough) |
| Events (3) | daily; weekly menus (Midi, Talloor d'Or, Boris & Maurice) change weekly |
| Full Michelin / G&M scrape | weekly + on each new edition |
| Geocoding | only for new/moved addresses |

## Rules
- Never invent data; when in doubt use `unknown` + a note in `dataConflict`.
- Be polite to sites: ≤1 request/second, own User-Agent, no login pages.
- No restaurant photos without permission; mood images live in `img/` (Unsplash License, see `img/CREDITS.json`).
