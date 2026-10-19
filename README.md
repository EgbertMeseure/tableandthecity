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
