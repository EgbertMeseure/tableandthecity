# Daily update – Table and the City

Goal: update each city's dataset every day without inventing anything. Anything that cannot be
confirmed stays `unknown`. The UI is English; sources are often Dutch (Gent).

## Data layout (multi-city)
- `data/cities.json` – brand, family sites, countries → cities (`id`, `name`, `active`, `data`, `center`, `zoom`).
  Add a city: add its entry (set `active: true` only when its data file is ready) → `?city=<id>`.
- `data/cities/<city>.json` – `{ city, restaurants[], extraEvents[], changelog[] }` (the site reads only this).
  - Optional `eventDetails{eventId: {venue, address, lat, lon, time, price, ticketUrl, blurb…}}` (not rendered yet).
    Import a researched events file: `python3 scripts/import_city_events.py <city> <file.json>` (skips past/undated events).
  - Per restaurant: `city`, `country`, `dateChecked` (last check), `lastChanged` (last content change),
    `vegetarian`/`vegan` = `yes|no|unknown`, `events[]` (`title, dateStart, dateEnd|dateText, type, location, partners[], sources[], note`; optional `tickets` = ticket-page URL → "Get tickets" button, optional `desc` = one-line description),
    `summary` (guide description, kept in original language, `summaryLang`), `original_nl` (Dutch source text of translated fields).
- `data/cities/<city>.csv` – flat export.
- `data/landing.json` – landing globe (world.html): country dots, per-city tagline, hero caption, label side and showcase photos. Heroes come from `data/cities.json`.
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
   set `opened: 'YYYY-MM'` (or `YYYY-MM-DD`); the site computes 'New since <Month YYYY>' itself for 12 months (the stored `isNew` flag is ignored;
   no known month → never New). Announced places go to `<city>-upcoming.json` with `opening: 'YYYY-MM'` (shown as 'Opening soon · <Month>',
   then 'New since <Month>' once that month has passed). Wine bars: `group: 'cafes_bars'`, `category: 'wine_bar'`. Closure: `status` = `temporarily closed` / `permanently closed` + `statusNote`;
   remove permanently closed places after 30 days (keep the changelog entry); OSM places go into `data/osm/closed.json`.
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
4c. **Visitor feedback** – read the "Know this place?" submissions (info@tableandthecity.com). Treat each as a *tip*, never as a source:
   verify on the place's own site/Instagram/menu (or a press source) before touching `features`/`features_evidence`, then add a changelog entry with that
   source URL. Ignore unverifiable tips. Nothing on the site updates automatically from feedback.
   Corrections (subject `Correction: …`), place suggestions (`Suggestion: …`) and city requests (`City request: …`) arrive at
   `info@tableandthecity.com` via FormSubmit (`FEEDBACK_FORMSUBMIT`), with Web3Forms as fallback (`FEEDBACK_ENDPOINT` / `FEEDBACK_ACCESS_KEY`);
   both in `js/config.js`, sent by `js/forms.js`. FormSubmit mails come from formsubmit.co with the form's subject.
4c-bis. **Other cities (Antwerpen)** – same pipeline, city slug as argument: `python3 scripts/import_osm.py antwerpen [--refresh]`
   (area = districts Antwerpen, Berchem incl. Zurenborg, Borgerhout via Overpass relation areas; see `CITY_CFG` in import_osm.py) and
   `python3 scripts/fetch_google_ratings.py antwerpen` (~680 Places Text Search calls per full run; `--raw FILE --offline` re-uses cached responses).
   Files: `data/cities/antwerpen*.json`, `data/osm/antwerpen-*.json`. Places Google marks CLOSED_PERMANENTLY go by OSM ref into `data/osm/closed.json` (with source).
   Curated layer from a research handoff folder: `python3 scripts/import_city_handoff.py antwerpen /workspace/handoff/antwerp` writes
   `antwerpen.json` restaurants[], `-upcoming.json`, `-veggie.json`, `-breakfast.json` (hours overrides from Google Maps are in OVERRIDES in the script);
   then `python3 scripts/import_osm.py antwerpen --fill-curated` (dedupe OSM against curated, fill empty fields), ratings
   (`fetch_google_ratings.py antwerpen`; note `--dry-run` still calls the API) and `fetch_hero_images.py antwerpen --curated-only --browser-check`
   (manual rejects in `data/osm/hero-review.json`).
   Isolation check (no data/text of another city leaks in): `python3 scripts/test_city_isolation.py [--shots DIR]` (needs the local server on :8765).
4d. **OpenStreetMap base list** (weekly, or daily on busy weeks) – `python3 scripts/import_osm.py gent --refresh --fill-curated`
   (re-downloads OSM, keeps ids stable, never overwrites curated data). Look at the printed counts: a big drop usually means Overpass returned a partial result —
   re-run. New places without an address need `data/osm/streets.json` (downloaded automatically, not in git). Put sourced fixes in `data/osm/corrections.json`
   (and ideally fix OSM itself). When an OSM place gets hand-researched, move it into `gent.json` (same name/location → the import then skips it).
   **No quick bites:** `amenity=fast_food` (frituren, snack bars, kebab/pita, night shops, takeaway pizza counters) is dropped at import. Exceptions are kept as
   Restaurants › Casual: a confirmed vegan / vegetarian / vegan-friendly level or confirmed breakfast/brunch (from the veggie and breakfast layers of the last
   run, persisted in `data/osm/keep-exceptions.json`, which only grows; remove an entry by hand to drop it). After an import, re-run 4e and 4h, then the import
   once more so newly confirmed places are picked up. Curated places are never dropped.
   **Never: pizza places and kebab / döner / shoarma / gyros / pita shops** (user decision 26 Oct 2026): `pizza_kebab_kind()` in scripts/import_osm.py
   (name pizz/pide/kebab/döner/pita…, OSM cuisine pizza/italian_pizza first or kebab/döner/shawarma/gyros/pita; curated cuisine text "Mini pizzas"), used by
   import_osm.py, import_city_handoff.py and merge_venues.py. Italian restaurants tagged `italian;pizza` stay unless their own site shows pizza is the
   main thing; those are listed by OSM ref in data/never-exclude.json (kind pizza/kebab). Unclear cases kept: `pizzaKebabKeep` there.
   Already-imported data: `python3 scripts/prune_pizza_kebab.py <city>` (removed list 26 Oct 2026: /workspace/handoff/place-photos/removed-pizza-kebab.md).
   Chains (data/chains-exclude.json, no-chains rule 26 Oct 2026: Umamido, Poule & Poulette, Mission Masala, Bavet, Balls & Glory, Le Botaniste, Poké House, Hawaiian Poké Bowl, Takumi, 8tea5 added): new imports skip them; already-imported data: `python3 scripts/prune_chains.py <city>`.
   **Never: friteries and student restaurants** (user decision 20 Oct 2026): friteries / frietkoten (name friet/frituur/fritkot/frites/chips, cuisine
   friture, or fries/chips fast food) and student / university cafeterias & restaurants (name student/cafetaria, or operator UGent / HoGent / hogeschool)
   are dropped with NO veggie / breakfast exception (`never_kind()` in import_osm.py; last run's names in `data/osm/gent-never-excluded.json`). Student cafés whose name/tags don't say so (e.g. Overpoort "Studentencafé Pallieter", LUXX) go by OSM ref into `data/never-exclude.json` (with reason + source); the import and `merge_venues.py` skip them. A curated
   record that looks like one is printed as a WARNING: remove it by hand.
   **No generic cafés / coffee houses:** OSM pub/bar/biergarten that is not a dance café, brown café, Irish pub, cocktail bar or beer bar, and every
   `amenity=cafe` that is not specialty coffee, is dropped at import with the same exceptions (confirmed veggie level or breakfast/brunch, same keep file).
   Kept generic cafés with breakfast/brunch move to Coffee; the others stay under Cafés & bars › All / Coffee › All. Specialty coffee and Shops & roasters stay.
   **Artisan bakeries only:** every OSM `shop=bakery` / `shop=pastry` is dropped unless it is in `data/bakeries-artisan.json` → `keep` (sourced artisan check)
   or `branchOf` (another shop of a curated bakery, merged into it). A veggie or breakfast level alone does not keep a bakery; those wait in
   `data/osm/gent-bakeries-pending.json` for an artisan check. New research: `python3 scripts/merge_bakeries.py gent` (reads
   `/workspace/handoff/gent-bakeries-research.json`; OSM shops → allowlist, others → `gent.json`; an allowlisted shop is shown under Bakeries even when OSM
   tags it as a café; conflicting hours → OVERRIDES in that script set them to null with a note), then import + 4e + 4h.
   **New openings & wine bars:** `python3 scripts/merge_new_winebars.py` merges `/workspace/handoff/gent-new-upcoming.json` + `gent-winebars.json`:
   opening month → `opened` on existing curated places, OSM places get sourced fields in `data/osm/corrections.json` (survive a re-import), new places
   are appended to `gent.json` (`origin: research-…`). Skips and kept conflicts are listed in the script (SKIP / CONFLICTS). Then rerun
   `scripts/fetch_google_ratings.py gent --raw <file outside the repo>` for the new places' scores.
   **Cocktail bars:** `python3 scripts/merge_cocktailbars.py gent` merges `/workspace/handoff/gent-cocktailbars-research.json` into `gent.json`
   (category `cocktail_bar`, sourced features, OSM ref so the import does not add it twice). Research notes (temporary closure with an end date →
   `statusUntil`, after which the site shows the place as open again; seasonal hours; 'Groups of 6+ only' reservations → `features_note`) live in
   OVERRIDES in that script. **Closed for good:** add the place to `data/osm/closed.json` (OSM ref or `name:<name>`, with source); the import skips it.
   **Big chains stay off the site:** the import drops every OSM element whose `brand:wikidata`, `brand` or name matches `data/chains-exclude.json`
   (McDonald's, Burger King, Quick, Domino's, Pizza Hut, Starbucks, Panos, Paul, Lunch Garden, Le Pain Quotidien, IzyCoffee, hotel / fuel-station / supermarket
   outlets…). Per-chain counts of the last run: `data/osm/gent-chains-excluded.json`. A new chain shows up? Add it (name, confirmed wikidata id, name pattern)
   and re-run — idempotent. Local multi-site Ghent/Belgian businesses are kept on purpose (list + reasons under `keep`). Curated / upcoming records are never
   dropped automatically: a match there prints `WARNING … looks like chain` — decide by hand. Don't add chain openings to `gent-upcoming.json`.
4h. **Photo review + photo research** (after `apply_media.py`, `build_instagram_layer.py`, `fetch_hero_images.py`, and whenever the research hand-off
   gets a new batch) – `python3 scripts/apply_photo_review.py gent && python3 scripts/apply_photo_review.py antwerpen`. Rule: a place shows food, drinks or
   the interior, never people (chef, staff, guests, portraits, hands). `data/osm/photo-review.json` holds the manual review (Instagram post categories —
   people / graphic posts are never shown —, people heroes, `hold` = no people-free photo → neutral monogram, `dropPhotos`, `skipResearch`). The research
   hand-off (`/workspace/handoff/place-photos-research/<city>/<id>/sources.json`, each image checked by eye) becomes `data/cities/<city>-photos.json`: own
   Instagram photos as official post embeds (permalink derived from the CDN url, checked once in headless Chrome that the embed shows the same photo) and own
   website photos hotlinked (≤ 1.6 MB; heavier ones, or with a `cropResearch` crop, self-hosted as webp under `img/places/<city>/<id>/`); the researcher's first usable candidate is the card + hero. Checks are cached in `data/osm/photo-research-checks.json`,
   so re-runs only check new candidates. Re-runnable and idempotent. The profile-grid embed is off (`igProfileEmbeds: false` in `js/config.js`): it shows
   whatever was posted last, often people.
4e. **Veggie / vegan layer** – `python3 scripts/veggie_layer.py gent` after every import; weekly follow `scripts/VEGGIE_CHECK.md`
   (refresh HappyCow, verify every 100% vegan / vegetarian place on its own site, add press finds). Never guess a level.
4g. **Hero photos** (monthly, and after each OSM import) – `python3 scripts/fetch_hero_images.py gent --browser-check` (new places only; `--refresh` re-checks all).
   Reads each place's own homepage `og:image` / `twitter:image` (what the business publishes for sharing), checks it (HTTPS, image, ≥ 800 px wide, landscape,
   not a logo / icon / flat graphic, loads as a hotlinked `<img>` in Chrome) and stores only the URL in `data/cities/gent-heroes.json`. Images are hotlinked
   (`referrerpolicy="no-referrer"`) with a "Photo: <domain>" credit, never downloaded or rehosted. Then `--sheet` → look at `/tmp/hero-sheet-*.png` and add
   logos / posters / screenshots / spam to `data/osm/hero-review.json` (re-run to apply). Hero order on a detail page: free-licence photo → website og:image →
   first Instagram photo post (official embed, scaled and clipped, credit @handle) → first tile of the official profile embed (checked handles only, see 4j) → monogram. List cards use the same photo (B&W, colour on hover). A broken hotlink falls back automatically.
4h. **Breakfast & brunch** – `python3 scripts/merge_breakfast.py gent` after every OSM import and whenever `/workspace/handoff/gent-breakfast-research.json`
   is updated (or `--handoff=path`). Sourced research values win over OSM tags (`breakfast=yes`, `brunch=yes`, `cuisine=…breakfast…`); nothing is guessed.
   "Opens early" on the site is computed from sourced opening hours (≤ 10:00) and is always shown as a fact ("Opens at 08:00"), never as "serves breakfast".
   'missing' places from the handoff are only added with name, address, coordinates, group and source.
4i. **Researched opening hours** – `python3 scripts/merge_hours.py gent [--handoff=…]` merges `/workspace/handoff/gent-hours-research.json`
   (idempotent): every string must parse with `js/hours.js` (failures are skipped and printed); valid ones are kept by OSM ref in
   `data/osm/hours-research.json`, which `import_osm.py` re-applies after each import **only where OSM has no opening_hours** (OSM hours are
   never overwritten). Records get `openingHours`, `openingHoursSource` (URL) and `openingHoursConfidence` (high/medium). The handoff's
   permanently closed places go to `data/osm/closed.json`; sourced address moves and temporary closures live in CORRECTIONS in that script
   → `data/osm/corrections.json` (`correctionSource`). Temporary closures: `status: "temporarily closed"`, `statusUntil` = last closed day
   (Europe/Brussels; the site shows the place as open again the day after, curated and OSM alike).
4j. **Instagram / photos** (weekly) – `python3 scripts/build_instagram_layer.py gent --check` (new handles; `--recheck` all; `--research=<file>`
   merges a researcher hand-off). Then `python3 scripts/photo_coverage.py gent --missing=/workspace/handoff/gent-photos-missing.json`.
4k. **Reservations** – `python3 scripts/merge_reservations.py gent [--handoff=…]` merges `/workspace/handoff/gent-reservations-research.json`
   (idempotent; `[{id,name,method,provider,bookingUrl,phone,source,note}]`, or check entries with `existing_reservation_url` + `status`).
   Stored in `data/osm/reservations-research.json` (OSM ref / `id:<id>`); `import_osm.py` re-applies the OSM part after each import.
   Writes `reservationMethod`, `reservationSource`, `reservationNote`, and `reservation_url`/`reservation_provider`/`phone` only where
   empty (a `status: "redirected"` entry replaces exactly that old link). Re-run it after `apply_media.py` (which resets curated links).
4f. **Closure spot-check** (monthly) – sample 40 random OSM places, check own site / recent listings, record in `data/osm/spotcheck-<date>.json`;
   closed places: fix in OSM (or add `"status": "closed"` via corrections) and re-import.
5. **Recompute `isNew`** – set `false` once `openingDate` is older than 18 months.
6. **Distinctions** – replace all scores when a new Michelin (spring) or Gault&Millau (November) edition appears.
7. **Photos & links** – no stock gallery images any more. Weekly: re-check `instagram_posts` (only permalinks from the official profile), `reservation_url` (still linked from the restaurant's own site, HTTP 200) and Wikimedia Commons for new freely licensed photos. Then `python3 scripts/build_features.py gent`. Optional (only if a key is configured): `GOOGLE_MAPS_API_KEY=… python3 scripts/fetch_google_photos.py gent` daily, since photo names expire.
8. **Finish** – set `dateChecked` (and `lastChanged` if content changed); add one `changelog` entry per change (with source URL);
   regenerate the CSV; test locally: `python3 -m http.server 8765` → `python3 scripts/screenshots.py` (fails on any console error).

## Before every commit / zip: cache-busting (always)
`python3 scripts/stamp_assets.py` — stamps every css/js include in `index.html` and `restaurant.html` with `?v=<build>` and sets
`<meta name="build">`; `js/common.js` adds the same `?v=` (plus `cache: 'no-cache'`) to its data fetches. `<build>` is a hash of all css, js
and city data, so browsers never mix an old cached stylesheet/script/data file with a new page (that showed as a broken detail page).
Idempotent; `--check` exits 1 when a page is not stamped with the current build. Then commit, push, and build the zip:
`git archive --format=zip --prefix=tableandthecity/ -o /workspace/tableandthecity-site.zip HEAD`.

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

## Languages (EN default · NL · DE · FR · ES)
- UI text lives in `scripts/i18n_strings.txt` (English key | nl | de | fr | es). After editing: `python3 scripts/i18n_build.py` (writes `js/i18n/<lang>.js`), then `python3 scripts/stamp_assets.py`.
- `js/i18n.js` picks the language from `?lang=xx` (remembered in localStorage), never from the browser; missing strings stay English. Restaurant names, addresses and curated descriptions are never translated.
- Check: `python3 scripts/test_i18n.py http://localhost:8765/` (every language loads landing/guide/place, no console errors, no English UI string left).
