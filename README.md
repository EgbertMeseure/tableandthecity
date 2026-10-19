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
- Detail hero: the first real exterior/interior photo; otherwise a neutral typographic hero (brand gradient, grain,
  outlined initial) — never a random dish.
- No posts and no photos → a "Photos coming soon" empty state linking to the restaurant's website / Instagram.

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
(desktop), tapping (touch) or ArrowDown (keyboard) opens a small menu of sub-categories with counts. Venue events (concerts, club
nights) appear in the Events section; past dates are hidden as usual.
