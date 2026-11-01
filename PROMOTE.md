# Promote your place — preview (Table and the City)

> Copy of the handoff README for the promote preview. Edit prices and links in `js/promote-config.js`.

Status: PREVIEW ONLY. Branch `preview-promote` (not merged, not live). GitHub Pages serves `main`, so nothing of this is on tableandthecity.com.
The page is not linked from any nav, footer or menu, carries `<meta name="robots" content="noindex">`, and is not in a sitemap (the site has none).

Files (branch `preview-promote`):
- `promote.html` — the page (`promote.html?country=be&city=gent`, any of the 5 cities; `&lang=nl|fr|de|es`).
- `promote-thanks.html` — thank-you page = Stripe success URL (noindex, not linked).
- `js/promote-config.js` — ALL packages, prices and Stripe links (the only file to edit for prices/links).
- `js/promote.js` — renders the cards, city chips, duration chips and buy buttons.
- `css/style.css` — "Promote your place" block at the end.
- `scripts/i18n_strings.txt` → `js/i18n/{nl,fr,de,es}.js` — translations (section "promote your place").

## Packages and suggested launch prices (EUR, excl. 21% VAT/BTW — suggestions, please review)

| id | Package | Duration | Excl. VAT | Incl. 21% VAT | Per city |
|---|---|---|---|---|---|
| top-list-week | Top of the list (pinned first in its category list, marked Promoted) | 1 week | €19 | €22.99 | yes |
| top-list-month | Top of the list | 1 month | €59 | €71.39 | yes |
| city-page-week | Top of the city page (1 of 4 slots in a "Featured" row) | 1 week | €39 | €47.19 | yes |
| city-page-month | Top of the city page | 1 month | €119 | €143.99 | yes |
| city-page-group | Top of the city page, 3 places of one owner/group | 1 month | €299 | €361.79 | yes |
| ig-story | Instagram story on @tableandthecity (link sticker, handle tagged) | 24 hours | €29 | €35.09 | no |
| ig-shared | Shared Instagram feed post (carousel with 3–5 places, themed) | stays on profile | €49 | €59.29 | no |
| ig-own | Own dedicated Instagram post (up to 10 photos, collab invite) | stays on profile | €99 | €119.79 | no |
| bundle-spotlight | Spotlight bundle: own post + story + top of list 1 month + city page 1 week | over one month | €179 (worth €226) | €216.59 | yes |

Reasoning:
- New guide, small but growing audience: prices sit well under what Belgian city media / established food accounts ask (often €150–500 per post) and around what local micro-creators (1–10k followers) charge, so a small independent place can say yes without thinking long. Raise them once traffic and follower numbers can be shown.
- A week is the impulse buy (€19 / €39), a month gives ~25% off vs 4 weeks, which nudges to the month.
- The city page is scarcer (4 slots per city, first thing people see) than a category list (max 2 promoted per list), so it costs about double.
- Instagram ladder: story (24 h, cheapest) < shared post (permanent, shared attention) < own post (permanent, all about them).
- The bundle is ~20% off the parts (€226 → €179), which makes it the obvious "launch / new opening" choice.
- Same price in every city for now (Brussels/Antwerp could go +20% later once their audience is bigger).

## Stripe setup (when the account exists)

1. Create the Stripe account (Belgium), add business details and your BTW number. Settings → Payment methods: enable cards, **Bancontact**, Apple Pay, Google Pay (the page mentions these; edit the terms note if you enable fewer).
2. VAT — pick one:
   - **Stripe Tax** (recommended): turn it on, add your Belgian registration, set prices as **tax-exclusive** (e.g. €19 + 21%). Turn on "Allow business customers to provide tax IDs" so EU businesses outside Belgium get reverse charge automatically.
   - Without Stripe Tax: set each price **incl. VAT** (the "Incl. 21% VAT" column) and make sure the invoice shows the 21% BTW.
   - If you use the small-business exemption (kleine ondernemingsregeling), you charge no VAT: tell me and I'll change the page text.
3. Products: one product per row in the table (9 products, one one-off price each). Name = package + duration, e.g. "Top of the list — 1 week".
4. **One Payment Link per product** (Payment Links → New). On each link:
   - Custom fields (Stripe allows **max 3**):
     1. `Place name` — Text, required.
     2. `Instagram handle` — Text, required for ig-story / ig-shared / ig-own / bundle-spotlight, optional for the guide packages.
     3. `Preferred start date` — Text, optional (label hint: "dd/mm/yyyy").
   - **City** does not need a field: the page adds `?client_reference_id=<city>__<package id>` to the link (e.g. `gent__top-list-week`, `brugge__city-page-month`). Stripe shows it on the payment in the Dashboard and sends it in the `checkout.session.completed` webhook. (If you prefer a visible field, swap "Instagram handle" for a `City` dropdown — Gent, Antwerpen, Brussel, Brugge, Oostende — on the guide-only links.)
   - The page also adds `&locale=<nl|fr|de|es|en>`, so checkout opens in the visitor's language. Custom field labels are not translated by Stripe; keep them in English or bilingual ("Place name / Naam zaak").
   - Options: collect email (always on), optionally phone number; "Create invoices" ON; "Collect tax IDs" ON; limit quantity to 1.
   - After payment → "Don't show confirmation page" → redirect to `https://www.tableandthecity.com/promote-thanks.html` (only works once that page is on main).
   - Optional: add the terms URL (`https://www.tableandthecity.com/promote.html#terms`) under "Require customers to accept your terms".
5. Notifications: Settings → Communication preferences → turn on "Successful payments" to get an email for each successful payment (that is your order inbox).
6. Paste each link (https://buy.stripe.com/…) in `js/promote-config.js` → `stripeUrl` of the matching `id`. Empty = the button stays a disabled "Coming soon".
7. `python3 scripts/stamp_assets.py`, `node scripts/test_hours.js`, commit.

## How it goes live later

1. **Build the placements first** — the guide does not yet show a pinned "Promoted" place in category lists or a "Featured" row on the city page. That rendering (plus a small data file such as `data/promoted.json`: place id, city, type, start, end) has to exist before you sell those packages. Instagram packages can be sold right away.
2. Create the Stripe links (above) and paste them in `js/promote-config.js`; review the prices there.
3. Merge `preview-promote` into `main` (after rebasing on the latest main; re-run `scripts/i18n_build.py` and `scripts/stamp_assets.py` if those conflict).
4. Decide where to link it (e.g. a small "Promote your place" link in the footer, nav drawer or on the "Are you a private chef? Get listed" line), and whether to drop `noindex` and add it to a sitemap.
5. Test one real purchase with a Stripe test-mode link first (test links look like `https://buy.stripe.com/test_…`).
