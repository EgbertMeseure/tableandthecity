# Table and the City — prototype (tableandthecity.com)

Static site, no build step. Serve the folder and open `index.html?city=gent`:

    python3 -m http.server 8765   # http://localhost:8765/index.html?city=gent

- `index.html` – B&W home: hero, city selector, category pill carousel, greyscale map + list, filters/sort/search, events, about.
- `restaurant.html?city=gent&id=<id>` – full-colour detail page.
- `css/brand.css` – shared "… and the City" design system (tokens, grain, pills, wordmark, B&W→colour hover, carousel, footer).
  **Arts and the City**: copy `brand.css` and override only `--accent` (and `--accent-ink`/`--accent-soft`) in `:root`;
  wordmark markup: `<span class="wm-main">Arts</span><span class="wm-sub">and the City</span>`.
- `css/style.css` – Table-specific layout.  `js/common.js` – helpers, city routing, header/footer.  `js/app.js`, `js/detail.js`.
- `data/cities.json` + `data/cities/<city>.json` – multi-city data (see `update.md`).
- `scripts/` – scrapers, geocoder, translation build, daily change check, screenshot verification.

## Countries, cities & URLs
`data/cities.json` lists countries → cities. Only Belgium / Gent is active; other countries and cities show “soon”.
URLs: `index.html?country=be&city=gent`, `restaurant.html?country=be&city=gent&id=<id>`. Filters are in the URL too
(`q, type, area, cuisine, price, dist, sort, new, veggie, vegan, events, ev`).

## Events
Only upcoming events are shown (end date ≥ today in Europe/Brussels, computed in the browser at page load).
Undated events are hidden unless `ongoing: true` with a future `dateEnd`. Recurring events use `recurrence` and show
their next date. `scripts/prune_events.py <city>` archives past events every day (see `update.md`).

## Photos & gallery
Galleries only show **the restaurant's own content or freely licensed photos of the venue** — no stock "mood" images,
and nothing copied from restaurant websites, Instagram, Google, TripAdvisor etc.

Per restaurant (`data/cities/<city>.json`):
- `instagram_handle`, `instagram` (profile URL) — the official account, taken from a link on the restaurant's own
  website (or, if the site has none, a profile whose name/bio clearly matches; see `data/cities/<city>-media-sources.json`).
- `instagram_posts: [{url, category}]` — up to 6 recent public post/reel permalinks found on that official profile
  (never invented; each permalink was opened through Instagram's public embed endpoint and checked to belong to the
  handle). `category` (`food|interior|chef|exterior|''`) is a guess from Instagram's own alt text / a visual check.
  They render with Instagram's official embed (`blockquote.instagram-media` + `//www.instagram.com/embed.js`,
  injected only when the gallery scrolls near the viewport), so images stay hosted by Instagram with their credit.
  A "More on Instagram @handle" button links to the profile.
- `photos: [{src, thumb, srcset, w, h, category, alt, credit, credit_url, license, license_url, source, source_url}]` —
  `source: "commons"` for Wikimedia Commons files (CC BY / CC BY-SA / CC0 / PD only), stored in `img/commons/` as
  800/1600/2400 px WebP, credited with author + licence + link to the file page. `source: "own"` for photos a
  restaurant supplied with written permission (`img/r/<id>/…`).
- **One photo per place, everywhere** (`TG.cardPhoto(r)` in `common.js`): free-licence / own photo → the place's own website
  `og:image` (`data/cities/<city>-heroes.json` or the research layer; hotlinked with `referrerpolicy="no-referrer"`, "Photo: <domain>")
  → first Instagram photo post (official post embed) → the official **profile embed** `https://www.instagram.com/<handle>/embed/`
  (shows the account's recent photo grid without a login; used only for handles whose embed was checked, see below) → monogram.
  The same photo is used on the list card (B&W, colour on hover; 74×120 crop), the detail hero (full colour) and the gallery.
  List cards: the monogram is always underneath; a broken hotlink removes itself. Instagram iframes on cards are created only when the
  card scrolls into view (IntersectionObserver), max 3 loading at a time; detail-page gallery embeds load near the viewport.
  Embeds are scaled and clipped with `TG.fitIg()` (post: 54 px header + 4:5 photo; profile: centre of the first grid tile).
- Gallery: Instagram posts, or the profile embed widget when there are no posts, plus the website og:image (tag "Website") and
  free-licence photos. Nothing → "Photos coming soon" (or a link tile to the profile when its embed does not render).
- `data/cities/<city>-instagram.json` (`scripts/build_instagram_layer.py`): `places` = researched handles / post permalinks / og:images
  (`origin: "research (approved 20 Oct 2026)"`; a researched handle replaces a missing or renamed one, null = not
  confirmed → no embed), `embed` = per handle whether the profile embed renders (`--check`, headless Chrome from 127.0.0.1).
  `python3 scripts/photo_coverage.py gent --missing=/workspace/handoff/gent-photos-missing.json` prints coverage and lists places still
  without a photo that have a website or handle.

### Google Places Photos (prepared, not active)
`scripts/fetch_google_photos.py` uses the **Places API (New)**: `places:searchText` with
`X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.photos`, keeps the
match within 150 m of our coordinates and stores `google_place_id` + `google_photos: [{name, widthPx, heightPx,
authorAttributions}]`. Run it with `GOOGLE_MAPS_API_KEY=… python3 scripts/fetch_google_photos.py gent` (add `--dry-run`
to test). It never downloads image bytes (Google's terms don't allow caching photos; photo names can expire, so re-run
it in the daily job).

The front-end renders them only when `js/config.js` has `window.TG_CONFIG = {googleMapsKey: '…'}`, via
`https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=1600&key=…`, with the required attribution
("Google Maps · Photo: <authorAttributions.displayName>" linked to `authorAttributions.uri`).
**That key is visible to every visitor.** Either:
1. use a separate *browser* key restricted by **HTTP referrer** (`https://tableandthecity.com/*`) and by API
   (Places API (New) only), with a daily quota cap; or
2. keep the key server-side: a Cloudflare Pages Function (e.g. `functions/photo/[[name]].js`) that receives the photo
   name, calls the media endpoint with `skipHttpRedirect=true` using a secret env var, and returns a redirect to the
   short-lived `photoUri` — then point the gallery at `/photo/<name>` instead.

### Reservations
`reservation_url` is the booking link the restaurant itself uses, read from its own website (Zenchef, SevenRooms,
Guestplan, TheFork widget… or its own reservation page), checked to return HTTP 200; `reservation_provider` names the
system. The detail page shows a primary **Reserve** button; without a verified link it falls back to the website, or
`tel:` ("Call to reserve") if there's only a phone number. List cards show a small "Reserve ↗" link only for verified links.
**Booking button on list cards** (categories in `TG_CONFIG.BOOKING_BUTTON_TYPES` in `js/config.js`, now `['fine dining']`; add a
category, or `'*'` for all restaurants): `reservation_url` → black pill "Check availability ↗" (new tab, replaces "Reserve ↗");
no link but a phone → outlined pill "Reservation by phone" (`tel:`, the number shows on hover and in the tooltip);
`reservationMethod: "walk-in"` → small "Walk-in only" chip; otherwise nothing. Researched booking info:
`python3 scripts/merge_reservations.py gent` (see update.md 4k). Quick filter **Open now** (`open=1` in the URL) uses `js/hours.js`.

### Feature tiles ("At a glance")
`features: {veggie, vegan, glutenFree, kidsWelcome, terrace, lunch, dinner, setMenu, aLaCarte, winePairing, naPairing,
michelin, gaultMillau, events, chefCollabs, reservations, walkIn, wheelchair, openSunday, new}` — each `true | false | null`
(default `null`), with `features_evidence` explaining every `true`. `scripts/build_features.py` derives them only from
sourced fields (diet fields, menu type from the restaurant's site, Michelin/G&M descriptions, distinctions, opening date,
booking link); `events`/`chefCollabs` are computed in the browser from upcoming events. A tile is green only for `true`;
`false` and `null` both look neutral (tooltip "No" vs "Not confirmed"). Put verified manual facts in
`data/cities/<city>-features-overrides.json` as `{"<id>": {"terrace": {"value": true, "source": "<url>"}}}`.
`openingHours` (string, default `null`) is shown when known.

## Carousels
All horizontal rows (categories, events) use one helper, `TG.carousel(track)` in `js/common.js`: CSS scroll-snap on an `overflow-x` track, native touch swipe and trackpad/Shift+wheel scrolling, mouse click-drag with momentum (a drag never fires a card click), ←/→ keys when the track has focus, and arrow buttons (`data-car-prev="<track id>"` / `data-car-next`) with 44px+ targets that turn disabled at the ends. Test: `python3 scripts/test_carousels.py` (needs the local server on :8765).

## Groups: restaurants, cafés & bars, coffee, bakeries
Every record in `data/cities/<city>.json` has a `group` (`restaurants`, `cafes_bars`, `coffee`, `bakeries`) and a `category`
(restaurant type, or `dance_cafe`, `brown_cafe`, `irish_pub`, `cafe`, `coffee_bar`, `bakery`). Venues and new businesses come from
`data/cities/<city>-venues-new.json` and are merged with `python3 scripts/merge_venues.py <city>` (idempotent; re-run after the
venues file changes, then `apply_media.py` and `build_features.py`, which leave venue records alone). Records with
`status: "unverified"` stay in the data but are never shown. "Choose your table" shows one card per group (+ New, Events); hovering
(desktop), tapping (touch) or ArrowDown (keyboard) reveals the sub-categories with counts **inside the card itself**
(a dark gradient slides up from the bottom, clipped by the card's stadium shape; items are small pills; Enter/ArrowDown/ArrowUp/Escape work,
a drag never opens or clicks a card). Venue events (concerts, club
nights) appear in the Events section; past dates are hidden as usual.

## New → Just opened / Opening soon
The **New** card's menu has *Just opened* (`isNew` records in `<city>.json`) and *Opening soon*: announced-but-not-open places from
`data/cities/<city>-upcoming.json` (linked as `upcoming` in `data/cities.json`). Each has `expectedOpening` (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`
or `"soon"`, optional `expectedOpeningLabel` such as "Autumn 2027"), `description`, `team`, `sources`, `announcedBy`, `dateChecked`.
They only appear under New (URL `?new=1&stage=soon`), with an "Opening soon · <date>" badge, a hollow dashed map marker, no Reserve button,
no confirmed features unless sourced, and a detail-page box with the expected opening and a link to the announcement. When the date (or the
whole month/year) has passed in Europe/Brussels the browser shows the place as *Just opened* automatically — then move it into `<city>.json`
(see `update.md`). A record with the same `id` in `<city>.json` always wins.

## List cards
The description line is replaced by the place's confirmed *At a glance* features (same group-specific set as the detail grid,
`TG.featureTiles(r)` in `common.js`): only `true` values, max 4 chips + "+N". No confirmed features → just the category line.

## Events
Event cards (home + detail) lead with the event **name** (serif, max 3 lines); date + type form a small line above, the venue a small line below.

## Directions
"Directions" (detail page, map popups) opens Google Maps directions in a new tab:
`https://www.google.com/maps/dir/?api=1&destination=<name, address, Gent>` (lat,lng if no address; `&destination_place_id=` only when a real
`google_place_id` is stored). The maps themselves stay Leaflet/OpenStreetMap.

## Visitor forms (FormSubmit, fallback Web3Forms → info@tableandthecity.com)
All three visitor forms send with one button through `js/forms.js` (`TGForms.send`), always to info@tableandthecity.com.
Visitors never need their own mail app (there is no mailto fallback).
- **Primary: FormSubmit** – JSON POST to `FEEDBACK_FORMSUBMIT` (`https://formsubmit.co/ajax/info@tableandthecity.com`) with `_subject`,
  `_template: 'basic'` (FormSubmit's plainest e-mail), `_captcha: 'false'`, `_replyto` (visitor's email, if given), `_honey` (honeypot). Success = `success` is `true` or `"true"`;
  FormSubmit's "needs activation" answer counts as a failure (activate once via the link FormSubmit mails to info@).
- **Fallback: Web3Forms** – used only when FormSubmit fails (network, timeout, non-2xx, success false): JSON POST to `FEEDBACK_ENDPOINT` with
  `access_key`, `subject`, `replyto`, `botcheck`. Not primary because its Cloudflare managed challenge (403 `cf-mitigated: challenge`) blocks some
  visitors, e.g. from Belgium.
- Each attempt times out after 12 s; the error message appears only when both fail. States: **Send** → *Sending…* → a thank-you;
on a network error, timeout (15 s) or `success:false` the form shows "Couldn't send, please try again." and keeps what was typed.
- **Suggest a place** (`js/suggest.js`; footer, nav drawer, end of the list, `#suggest`): subject `Suggestion: <place>`; fields Place, City, Type, Location*, Why*, From*.
- **Know this place?** (`js/detail.js`, under *At a glance* on every detail page): tap pills (1× = has it ✓, 2× = doesn't have it, 3× = not sure) + an optional note; subject `Correction: <place>`; fields Place (`<place>, <city>`), Changes* (e.g. `Terrace: yes, has it; Veggie: no, doesn’t have it`), Note*, Link (the place page URL). Max 3 sends per place per 24 h per browser (`localStorage` key `tg-fb-<city>-<id>`).
- **Request your city** (`js/cityreq.js`, bottom of the Country/City dropdowns): subject `City request: <city>`; fields City, Country, From*.

The e-mails are kept minimal: only these fields, in this order, with short labels; * = only when given (empty fields are never sent).
No technical extras (no form type, page, timestamp or sender name). Reply-to = the visitor's email when given. The Web3Forms fallback sends the
same subject and fields. Anti-spam: a hidden honeypot in each form (filled → silently dropped in the browser), plus the services'
own honeypots (`_honey` / `botcheck`, sent empty).
Configure in `js/config.js` (public, no secrets): `FEEDBACK_FORMSUBMIT`, `FEEDBACK_ENDPOINT` (`https://api.web3forms.com/submit`) and
`FEEDBACK_ACCESS_KEY` (the Web3Forms access key; public by design, it can only send to the inbox it was created for). Both senders empty = the
forms and their entry points are hidden.
`FEEDBACK_EMAIL` = `info@tableandthecity.com`, the site's single contact address (reference only). Feedback **never changes data**; it is reviewed by hand (see update.md).

## Full coverage: OpenStreetMap base list + veggie/vegan layer
Besides the hand-curated places in `data/cities/gent.json` (`curated: true`, ranked first), the site loads every food & drink business in Gent
(incl. deelgemeenten) from OpenStreetMap: `data/cities/gent-osm.json`, built by `scripts/import_osm.py` (Overpass API, idempotent).
- Mapping: restaurant → Restaurants (brasserie/bistro by name, else generic), friteries, student/university cafeterias & restaurants, pizza places and kebab / pita shops (`pizza_kebab_kind()`, 26 Oct 2026) → always dropped (no exceptions), fast_food → dropped (no frituren / snack bars / kebab / night shops) unless it has a confirmed vegan/vegetarian/vegan-friendly level or breakfast/brunch → Restaurants › Casual (`data/osm/keep-exceptions.json`), pub/bar/biergarten → Cafés & bars
  (irish pub / cocktail bar / beer bar / dance / brown café by tags or name; generic cafés are dropped with the same exceptions), cafe → Coffee (specialty coffee
  by name; generic coffee houses are dropped with the same exceptions), shop=coffee → coffee shop/roaster, bakery → Bakeries, pastry → Patisserie — artisan
  only: OSM bakeries/patisseries are dropped unless listed in `data/bakeries-artisan.json` (keep / branchOf). Permanently closed places in
  `data/osm/closed.json` are skipped. Cocktail bars and artisan bakeries from research: `scripts/merge_cocktailbars.py`, `scripts/merge_bakeries.py`. Features (terrace, wheelchair, wifi, takeaway, gluten-free, vegan/veggie, open Sunday) only when explicitly tagged
  (evidence "OpenStreetMap: tag=value"). No descriptions are invented; OSM places show a "not yet reviewed" note and the feedback block.
- Dedupe: an OSM element with a similar name < 60 m (or the same distinctive name < 150 m) from a curated record is not added; `--fill-curated` only fills
  null fields of the curated record (website, phone, hours, terrace, wheelchair, gluten-free). Matches: `data/osm/gent-osm-matches.json`.
- Addresses: `addr:*` tags; otherwise the nearest named street (≤ 40 m) marked "street only, approx." District = deelgemeente (OSM boundary),
  neighbourhood = nearest OSM neighbourhood node. Sourced corrections on top of OSM: `data/osm/corrections.json`.
- No big chains: large franchise / multinational chains (fast food, coffee, bakery franchises, hotel-chain, supermarket and fuel-station outlets) are dropped
  at import via `data/chains-exclude.json` (brand:wikidata / brand / name); they are not shown and not counted. Local multi-site businesses are kept (see `keep`).
- Licence: **© OpenStreetMap contributors, ODbL 1.0** (https://www.openstreetmap.org/copyright) — shown in the footer of every page and in each OSM detail page's sources.
- Veggie/vegan: `data/cities/gent-veggie.json` (built by `scripts/veggie_layer.py`; see `scripts/VEGGIE_CHECK.md`) gives each place one level —
  100% vegan, 100% vegetarian, vegan options, veggie options — with sources and a note; badges, the detail-page box, the "Veggie & vegan" card
  (100% vegan / 100% vegetarian / vegan-friendly / veggie options only), the Restaurants sub-menu (Vegan, Vegetarian, Vegan-friendly) and the quick
  pills (Veggie & vegan · Vegan options · 100% vegan) all read it.
- Performance: list shows 24 cards + "Show more"; map markers are clustered with the vendored `vendor/leaflet.markercluster` (MIT); markers are built once.
- Research hand-offs (`{places:{id:{field:{value,source,note}}}}`) are merged with `scripts/merge_handoff.py gent <file>` (adds `openMonday`, hours as
  "Mon closed · Tue–Sat 18:00–22:00", price only when unknown; barsgent.be is never used as a source).

## Photos: website heroes + Instagram gallery (no rehosting)
- **Hero** (detail pages): a free-licence photo if we have one; otherwise the place's own `og:image` from its homepage (`data/cities/gent-heroes.json`, built by
  `scripts/fetch_hero_images.py`, hotlinked with a "Photo: <domain>" credit); otherwise its first Instagram photo post via Instagram's official embed iframe
  (scaled to cover, not interactive, credit @handle links to the post); otherwise the monogram. Broken hotlinks fall back automatically.
- **No people** (owner rule, Oct 2026): every photo is food, drinks or the interior. Photos from the photo research (`data/cities/<city>-photos.json`,
  `scripts/apply_photo_review.py`, see update.md 4h) lead the card and hero; Instagram posts categorised people / graphic are never shown; places with only
  people photos show the monogram; the Instagram profile-grid embed is off by default (`igProfileEmbeds`).
- **Gallery**: a horizontal rail. Instagram posts (`instagram_posts`, max 8) are shown with Instagram's official `/p/<shortcode>/embed/` iframe, clipped to
  a square tile so mainly the photo shows, lazy-loaded, with a "View on Instagram @handle" link; tapping the photo opens the post on Instagram.
  We never download Instagram media: Instagram's `/media/?size=l` hotlink is blocked in browsers (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`), so we don't use it.
  Places with an Instagram account but no collected posts get one "See photos on Instagram" tile linking to the profile.
## Breakfast & Brunch
- Card "Breakfast & Brunch" in *Choose your table*: confirmed breakfast / brunch (sourced: research handoff or explicit OSM tags, `data/cities/gent-breakfast.json`,
  `scripts/merge_breakfast.py`), weekend brunch (shown once ≥ 3 places), and separately **Opens early** = opens at or before 10:00 by sourced opening hours
  (restaurants, cafés & bars, coffee; bakeries only with seating). Opens early is a fact about hours, never labelled as serving breakfast.
- "Breakfast" and "Brunch" tiles in *At a glance* (all groups) and in the feedback pills.

## Open now
`js/hours.js` (`TGHours`, no dependencies, also loads in node) parses `openingHours` strictly — OSM `opening_hours` syntax
("Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off", `24/7`, comma day lists, `,` additional rules, `;` overrides, extended times like 26:00)
and our curated text ("Mon closed · Tue–Sat 18:00–22:00 · Sun closed", "Weekdays …; weekends & holidays …", "from 11:00 to 01:00").
Everything is evaluated in **Europe/Brussels** time (Intl, whatever the visitor's time zone); overnight ranges count after midnight.
Strict, never guessed: month/date rules, `Su[1]`, comments, "from 18:00" without an end, "dinner", conditions in brackets, conflicting
days → the whole string is *unknown* (no label). Curated text: a day not mentioned is unknown (OSM: closed). PH rules are ignored; on a
Belgian public holiday a schedule that mentions holidays is unknown. Open end (`18:00+`) is never shown as closed. A `status` other than
`open` (temporarily closed, renovation until `statusUntil`) is never open; an `openingHoursNote` ("sources differ") makes hours unknown.
- Every list (all places, group/sub-filters, search, any sort) is ordered **open → unknown → closed**, the chosen ranking inside each group;
  "Show more" pages through the re-sorted list. Cards: green **Open now** pill, grey "Opens 18:00" / "Opens Tue 08:00" / "Closed".
- Detail hero: "Open now · until 22:00" or "Closed · opens tomorrow 08:00". Map popups: "Open now". Nothing for unknown hours.
- Re-evaluated every minute: labels update in place; the list re-sorts only when it is out of view or the tab comes back (same cards
  shown, same scroll position).
- Test: `node scripts/test_hours.js` (also run with e.g. `TZ=America/Los_Angeles`); it prints parseable / not parseable counts per file.
