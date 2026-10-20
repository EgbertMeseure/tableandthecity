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
- After updating `data/cities/<city>-venues-new.json`: `python3 scripts/merge_venues.py <city> && python3 scripts/apply_media.py && python3 scripts/build_features.py`.
- `data/cities/<city>-events-archive.json` – past events moved out by `prune_events.py`.
- `data/cities/<city>-media-sources.json` – where each Instagram handle / post / reservation link was found.
- `data/cities/<city>-features-overrides.json` – optional verified manual feature facts (with source).
- `data/source-nl/` – frozen Dutch working data for Gent; `scripts/translate_en.py` rebuilds `data/cities/gent.json` from it
  (then run `build_features.py` and `prune_events.py`).
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
4b. **Upcoming openings** – search (current year) `opent binnenkort Gent`, `opent in <maand> Gent`, `nieuwe zaak Gent`, HLN "Net binnen",
   Nieuwsblad regio Gent, BeleefGent/visit.gent "coming soon", Instagram announcements. Add to `data/cities/<city>-upcoming.json` only with a
   credible source announcing a date or "binnenkort" and only if not open yet; unknown fields `null`. Re-check every week; drop cancelled projects.
   **When `expectedOpening` has passed** (the site already shows it as *Just opened*): verify it really opened (press/own site/Instagram), then
   move the record into `<city>.json` (via `<city>-venues-new.json` + `merge_venues.py` for venues, or directly for restaurants) with
   `openingDate`, `isNew: true`, sources and a changelog entry, and delete it from the upcoming file. If it slipped, update `expectedOpening`.
4c. **Visitor feedback** – read the "Know this place?" submissions (form inbox / `FEEDBACK_EMAIL`). Treat each as a *tip*, never as a source:
   verify on the place's own site/Instagram/menu (or a press source) before touching `features`/`features_evidence`, then add a changelog entry with that
   source URL. Ignore unverifiable tips. Nothing on the site updates automatically from feedback.
   ⚠ `FEEDBACK_EMAIL` is still the placeholder `hello@tableandthecity.com` (no real inbox): replace it in `js/config.js` once a real address/form endpoint exists — until then no feedback arrives.
4d. **OpenStreetMap base list** (weekly, or daily on busy weeks) – `python3 scripts/import_osm.py gent --refresh --fill-curated`
   (re-downloads OSM, keeps ids stable, never overwrites curated data). Look at the printed counts: a big drop usually means Overpass returned a partial result —
   re-run. New places without an address need `data/osm/streets.json` (downloaded automatically, not in git). Put sourced fixes in `data/osm/corrections.json`
   (and ideally fix OSM itself). When an OSM place gets hand-researched, move it into `gent.json` (same name/location → the import then skips it).
   **Big chains stay off the site:** the import drops every OSM element whose `brand:wikidata`, `brand` or name matches `data/chains-exclude.json`
   (McDonald's, Burger King, Quick, Domino's, Pizza Hut, Starbucks, Panos, Paul, Lunch Garden, Le Pain Quotidien, IzyCoffee, hotel / fuel-station / supermarket
   outlets…). Per-chain counts of the last run: `data/osm/gent-chains-excluded.json`. A new chain shows up? Add it (name, confirmed wikidata id, name pattern)
   and re-run — idempotent. Local multi-site Ghent/Belgian businesses are kept on purpose (list + reasons under `keep`). Curated / upcoming records are never
   dropped automatically: a match there prints `WARNING … looks like chain` — decide by hand. Don't add chain openings to `gent-upcoming.json`.
4e. **Veggie / vegan layer** – `python3 scripts/veggie_layer.py gent` after every import; weekly follow `scripts/VEGGIE_CHECK.md`
   (refresh HappyCow, verify every 100% vegan / vegetarian place on its own site, add press finds). Never guess a level.
4f. **Closure spot-check** (monthly) – sample 40 random OSM places, check own site / recent listings, record in `data/osm/spotcheck-<date>.json`;
   closed places: fix in OSM (or add `"status": "closed"` via corrections) and re-import.
5. **Recompute `isNew`** – set `false` once `openingDate` is older than 18 months.
6. **Distinctions** – replace all scores when a new Michelin (spring) or Gault&Millau (November) edition appears.
7. **Photos & links** – no stock gallery images any more. Weekly: re-check `instagram_posts` (only permalinks from the official profile), `reservation_url` (still linked from the restaurant's own site, HTTP 200) and Wikimedia Commons for new freely licensed photos. Then `python3 scripts/build_features.py gent`. Optional (only if a key is configured): `GOOGLE_MAPS_API_KEY=… python3 scripts/fetch_google_photos.py gent` daily, since photo names expire.
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
- No restaurant photos without permission or a free licence (Commons CC BY/BY-SA/CC0/PD, credited); Instagram only via the official embed. Category/hero images in `img/` are Unsplash License (see `img/CREDITS.json`).
