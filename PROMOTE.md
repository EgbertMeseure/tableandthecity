# Promote your place — preview (Table and the City)

Status: PREVIEW ONLY. Branch `preview-promote` (not merged, not live). GitHub Pages serves `main`, so none of this is on tableandthecity.com.
The page is not linked from any nav, footer or menu, has `<meta name="robots" content="noindex">`, and is not in a sitemap (the site doesn't have one).

Files (branch `preview-promote`):
- `promote.html`: the page (`promote.html?country=be&city=gent`, works for all 5 cities; add `&lang=nl|fr|de|es` for another language).
- `promote-thanks.html`: thank-you page, used as the Stripe success URL (noindex, not linked).
- `js/promote-config.js`: ALL packages, prices, capacities and Stripe links. Edit only this file to change prices or links.
- `data/promote-bookings.json`: sold spots, which drive the availability calendar (see "Add a booking"). Empty at the start.
- `data/promote-bookings.example.json`: demo bookings for previewing the calendar: `promote.html?country=be&city=gent&bookings=example`.
- `js/promote.js`: city chips, place selector, calendars, summary, buy buttons.
- `css/style.css`: the "Promote your place" blocks at the end.
- `scripts/i18n_strings.txt` → `js/i18n/{nl,fr,de,es}.js`: translations (section "promote your place").

## How the page works

1. The buyer picks a **city**, then **their own place** from a searchable list of the places in that city. The list comes from the same data the guide uses (`TG.load`), so it matches the guide. "My place is not in the guide yet" is the last option in the list; it sends place id `new`, and they name the place in the Stripe notes field.
2. Each package has an **availability calendar** for the current month and the next 5 (`months: 6` in the config):
   - Top of the list: a grid of months × positions #1–#5 (€49/€39/€29/€19/€15), for the place's own list (its group: Restaurants, Cafés & bars, Coffee or Bakeries). A position that is taken shows "Full" ("Fully booked" for screen readers) and can't be picked.
   - Top of the city page: one button per month with "2 of 3 free" or "Fully booked" (3 spots per city).
   - Instagram: one button per month with the free count. Capacity covers the whole account, all cities together: story 8, shared post 4, own post 4 per month (`capacity` in the config).
   - Bundle: a month is free only if position #1 in the place's list, a city-page spot, an own post and a story are all free that month.
   - Monthly packages: if a later month is already booked, the summary says "From November 2026 · until January 2027".
3. A **summary** above the buy button shows the place, city, position and month. The button stays "Choose your place first" until a place is picked. When `stripeUrl` is empty the button says "Coming soon", which is the state now.
4. Buy = the package's Stripe Payment Link + `?client_reference_id=<city>__<package id>__<YYYY-MM>__<place id>&locale=<en|nl|fr|de|es>`
   e.g. `gent__top-list-2__2027-01__a-food-affair`, `brugge__bundle-monthly__2026-12__osm-1809-bistro-la-concorde-n12789848389`, `gent__ig-story__2026-11__new`.
   Only `A-Z a-z 0-9 - _` are used, and the value is at most 200 characters (the place id gets cut if needed), as Stripe requires. Stripe shows it on the payment in the Dashboard and sends it in the `checkout.session.completed` webhook and in the payment email.

## Packages and prices (EUR, excl. 21% VAT/BTW; suggestions to review)

| id | Package | Billing | Excl. VAT | Incl. 21% VAT | Spots |
|---|---|---|---|---|---|
| top-list-1 | Top of the list, position #1 | monthly subscription | €49 / month | €59.29 | 1 per list per city |
| top-list-2 | Top of the list, position #2 | monthly subscription | €39 / month | €47.19 | 1 per list per city |
| top-list-3 | Top of the list, position #3 | monthly subscription | €29 / month | €35.09 | 1 per list per city |
| top-list-4 | Top of the list, position #4 | monthly subscription | €19 / month | €22.99 | 1 per list per city |
| top-list-5 | Top of the list, position #5 | monthly subscription | €15 / month | €18.15 | 1 per list per city |
| city-page-month | Top of the city page (Featured row) | monthly subscription | €99 / month | €119.79 | 3 per city |
| ig-story | Instagram story (24 h, link sticker) | one-off | €15 | €18.15 | 8 per month (all cities) |
| ig-shared | Shared Instagram post (carousel with 3–5 places) | one-off | €25 | €30.25 | 4 per month (all cities) |
| ig-own | Your own Instagram post (up to 10 photos, collab) | one-off | €99 | €119.79 | 4 per month (all cities) |
| bundle-monthly | Monthly bundle: top of the list #1 + city page + own post + story, every month | monthly subscription | €209 / month (separately €262, about 20% off) | €252.89 | needs all four parts free |

Why these prices: monthly prices, with the top of the list getting cheaper further down (#5 at €15 is an easy yes). The city page is the scarcest spot (3 per city, the first thing visitors see), so it costs as much as an own post. The bundle is €262 bought separately; €209 is about 20% off, and it ends in 9 like the other prices. The price is the same in every city.

## Stripe setup (once the account exists)

1. Create the Stripe account (Belgium) and add business details and your BTW number. Settings → Payment methods: turn on cards, **Bancontact**, Apple Pay and Google Pay. The page names these; edit the terms note if you turn on fewer.
2. VAT, pick one:
   - **Stripe Tax** (recommended): turn it on, add your Belgian registration and set prices as **tax-exclusive**. Turn on tax ID collection, so EU businesses outside Belgium get reverse charge.
   - Without Stripe Tax: enter the incl. VAT amounts and make sure the invoice shows 21% BTW.
   - On the small-business exemption (kleine ondernemingsregeling) you charge no VAT. Tell me and I'll change the page text.
3. Products and prices:
   - Top of the list: 5 products (positions #1–#5), each with a **recurring monthly** price (€49 / €39 / €29 / €19 / €15).
   - Top of the city page and the Monthly bundle: **recurring monthly** prices (€99, €209).
   - Instagram story, shared post and own post: **one-off** prices (€15, €25, €99).
4. **One Payment Link per package id** (10 links: one per top-list position, city page, bundle, 3 Instagram). On each link:
   - Custom fields (Stripe allows up to 3; 2 are needed now):
     1. `Instagram handle`: Text. Required on the Instagram packages and the bundle, optional on the others.
     2. `Notes`: Text, optional (preferred date, the name of a place that isn't in the guide yet, anything else).
   - Place, city, package, position and start month come in through `client_reference_id`, so there's no field for them.
   - The page adds `&locale=…`, so checkout opens in the visitor's language. Stripe does not translate custom field labels, so keep them in English or make them bilingual ("Notes / Opmerkingen").
   - Options: collect email (always on); "Create invoices" ON (one-off links); "Collect tax IDs" ON; quantity limited to 1.
   - After payment → redirect to `https://www.tableandthecity.com/promote-thanks.html`. This only works once that page is on main.
   - Optional: "Require customers to accept your terms" with `https://www.tableandthecity.com/promote.html#terms`.
5. **Cancelling subscriptions:** Settings → Billing → Customer portal: turn on "Cancel subscriptions" with **cancel at end of billing period**, and turn on the portal link in customer emails. That matches the terms ("stops at the end of the month you paid for").
6. Note on start month: a Payment Link bills the first month at checkout and renews monthly from that date. If someone picks a later start month, either accept it (their first paid month runs from the chosen month) or add a free trial on that price. Payment Links can only use a fixed number of trial days, so this is something to decide.
7. Notifications: Settings → Communication preferences → "Successful payments" ON, so every sale arrives in your inbox.
8. Paste each link (`https://buy.stripe.com/…`) into `js/promote-config.js` → `stripeUrl` of the matching `id`. An empty link keeps the button on "Coming soon".
9. `python3 scripts/stamp_assets.py`, `node scripts/test_hours.js`, then commit.

## Add a booking (after each sale)

Open `data/promote-bookings.json` and add one object to `bookings`. Use the `client_reference_id` from the Stripe payment:
`gent__top-list-2__2027-01__a-food-affair` → city `gent`, package `top-list-2`, start `2027-01`, place `a-food-affair`.

```json
{ "city": "gent", "package": "top-list-2", "list": "restaurants", "start": "2027-01", "end": null, "place": "a-food-affair", "stripe": "sub_123" }
```

- `city`: gent | antwerpen | brussel | brugge | oostende
- `package`: an id from the table above
- `list`: only for `top-list-*` and `bundle-monthly`. It's the place's group: `restaurants` | `cafes_bars` | `coffee` | `bakeries` (shown in the calendar as "Free spots in the … list"; for a place, look up `group` in `data/cities/<city>.json` or `<city>-osm.json`)
- `start`: first month, `YYYY-MM`
- `end`: last month `YYYY-MM`. For a running monthly subscription use `null`. When it gets cancelled, set `end` to the last paid month. For one-off Instagram packages leave `end` out (= only the start month).
- `place`: the place id (or `new`); `stripe`: optional, for your own reference.

Then commit (the file is loaded fresh, no stamp needed, but running `stamp_assets.py` does no harm). A spot that is taken shows Full / Fully booked in that month and can't be picked. More examples are in `data/promote-bookings.example.json`.

## How it goes live later

1. **Build the placements first.** The guide does not show a pinned "Promoted" place in category lists or a "Featured" row on the city page yet. That rendering has to exist before you sell those packages; it can read the same `data/promote-bookings.json` (city, list, position, months). Instagram packages can be sold right away.
2. Create the Stripe links (see above), paste them into `js/promote-config.js` and review the prices there.
3. Merge `preview-promote` into `main` after rebasing on the latest main. If those files conflict, re-run `scripts/i18n_build.py` and `scripts/stamp_assets.py`.
4. Decide where to link the page (for example a small footer link), and whether to drop `noindex`.
5. Test one purchase with a Stripe test-mode link first (`https://buy.stripe.com/test_…`).

## Open questions

- VAT status (BTW-registered or small-business exemption)?
- Instagram capacity per month (8 stories / 4 shared / 4 own posts): is that right for the account?
- Top of the list per group (Restaurants / Cafés & bars / Coffee / Bakeries), or per sub-list (fine dining, bistro, …)?
- Start month in the future: free trial, or bill at checkout (see Stripe setup 6)?
- Who takes or supplies the photos for an own post?
