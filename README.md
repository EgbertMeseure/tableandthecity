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
Each restaurant has `photos: [{src, thumb, w, h, category: food|interior|chef|exterior, alt, credit, credit_url, source, source_url, license}]`
and optional `instagram_posts: ["https://www.instagram.com/p/…/"]`. `source` is one of `own | google_places | instagram_embed | stock`.
The detail page shows a masonry gallery (category pills, lightbox with arrows / swipe / Esc, captions with credit).

**Right now every photo is `source: "stock"`**: free Unsplash images (Unsplash License) stored in `img/gallery/`
(1600 px and 800 px WebP), picked from `data/photo-pool.json` by `scripts/assign_photos.py`. Each one is labelled
“Mood image, not from this restaurant”. Never copy photos from restaurant websites, Instagram or Google.

How to add real photos later:
1. **Restaurant-supplied (best).** Ask for written permission and the credit line. Save as
   `img/r/<id>/<n>-1600.webp` + `-800.webp` (WebP, ~1600 px, q≈72). Add
   `{src, thumb, category, alt, credit: "Photo: <photographer> for <restaurant>", source: "own"}`.
   `assign_photos.py` keeps every non-stock photo; drop the stock ones for that restaurant once there are ≥4 real ones.
2. **Google Places Photos API.** Use Place Details → `photos[].name`, then load `…/v1/{photo.name}/media?maxWidthPx=1600&key=…`
   **at runtime** (don't download or cache beyond what the Google Maps Platform terms allow). Show the required
   attribution: “Google Maps” plus each photo's `authorAttributions` (name + link), and keep the API key restricted
   to your domain. Store `{source: "google_places", place_id, photo_name, credit, credit_url}`; the gallery prints
   “Google Maps · Photo: …”.
3. **Instagram.** Add post URLs to `instagram_posts`; they render with Instagram's official embed
   (`blockquote.instagram-media` + `embed.js`, loaded lazily when the gallery scrolls into view), so the image stays
   hosted by Instagram with its credit. The profile link uses the existing `instagram` field.

## Carousels
All horizontal rows (categories, events) use one helper, `TG.carousel(track)` in `js/common.js`: CSS scroll-snap on an `overflow-x` track, native touch swipe and trackpad/Shift+wheel scrolling, mouse click-drag with momentum (a drag never fires a card click), ←/→ keys when the track has focus, and arrow buttons (`data-car-prev="<track id>"` / `data-car-next`) with 44px+ targets that turn disabled at the ends. Test: `python3 scripts/test_carousels.py` (needs the local server on :8765).
