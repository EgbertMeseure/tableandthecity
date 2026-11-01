/* Table and the City – "Promote your place" packages (promote.html, preview only: not linked from the site, noindex).
   ONE place to edit prices and payment links. Every entry is one thing a place can buy = one Stripe Payment Link.
     id          unique, lowercase (sent to Stripe as part of client_reference_id: <city>__<id>)
     group       entries with the same group share one card on the page; the duration chips switch between them
     name        card title (English; translations in scripts/i18n_strings.txt)
     description one or two plain sentences (English; translated the same way)
     price       EUR, EXCLUDING 21% VAT (BTW). The page shows it as "excl. VAT" plus the incl. 21% amount
     duration    short label under the text ('Monthly, cancel any time', '24 hours', …); also translated
     position    Top of the list only: the spot in the list (1–5, cheaper further down); chip = its chip label; one Stripe link per position
     capacity    spots per month: city-page = per city (3); Instagram = for the whole account, all cities together (story 8, shared post 4, own post 4)
     includes    bundle only: the package ids it uses up (top of the list position 1 in the place's own list, a city-page spot, an own post, a story)
   Booked spots come from data/promote-bookings.json (see the README / PROMOTE.md: add one line per sale); full months can't be picked.
     recurring   'month' = a monthly subscription (Stripe Payment Link with a RECURRING monthly price, cancel any time);
                 absent = one-off payment
     stripeUrl   the Stripe Payment Link (https://buy.stripe.com/…). Empty = the button shows a disabled "Coming soon"
     perCity     true = bought for one city (the city picked on the page goes to Stripe in client_reference_id)
   Prices are launch SUGGESTIONS (see the README in the handoff folder) — review before going live. */
window.TG_PROMOTE = {
  currency: 'EUR',
  vatRate: 0.21,
  cities: ['gent', 'antwerpen', 'brussel', 'brugge', 'oostende'],
  months: 6,                                   // how many months the availability calendar shows, starting with the current month
  bookings: 'data/promote-bookings.json',
  packages: [
    { id: 'top-list-1', group: 'top-list', section: 'guide', perCity: true, recurring: 'month', position: 1, chip: '#1',
      name: 'Top of the list', description: 'Your place pinned in the top five of its category list in one city, marked Promoted. Pick your position.',
      price: 49, duration: 'Monthly, cancel any time', stripeUrl: '' },
    { id: 'top-list-2', group: 'top-list', section: 'guide', perCity: true, recurring: 'month', position: 2, chip: '#2',
      name: 'Top of the list', description: 'Your place pinned in the top five of its category list in one city, marked Promoted. Pick your position.',
      price: 39, duration: 'Monthly, cancel any time', stripeUrl: '' },
    { id: 'top-list-3', group: 'top-list', section: 'guide', perCity: true, recurring: 'month', position: 3, chip: '#3',
      name: 'Top of the list', description: 'Your place pinned in the top five of its category list in one city, marked Promoted. Pick your position.',
      price: 29, duration: 'Monthly, cancel any time', stripeUrl: '' },
    { id: 'top-list-4', group: 'top-list', section: 'guide', perCity: true, recurring: 'month', position: 4, chip: '#4',
      name: 'Top of the list', description: 'Your place pinned in the top five of its category list in one city, marked Promoted. Pick your position.',
      price: 19, duration: 'Monthly, cancel any time', stripeUrl: '' },
    { id: 'top-list-5', group: 'top-list', section: 'guide', perCity: true, recurring: 'month', position: 5, chip: '#5',
      name: 'Top of the list', description: 'Your place pinned in the top five of its category list in one city, marked Promoted. Pick your position.',
      price: 15, duration: 'Monthly, cancel any time', stripeUrl: '' },

    { id: 'city-page-month', group: 'city-page', section: 'guide', perCity: true, recurring: 'month',
      name: 'Top of the city page', description: 'One of three places in the Featured row at the top of the city page, the first thing visitors see.',
      price: 99, duration: 'Monthly, cancel any time', stripeUrl: '', capacity: 3 },

    { id: 'ig-story', group: 'ig-story', section: 'instagram', perCity: false,
      name: 'Instagram story', description: 'A story on @tableandthecity about your place, with a link sticker to your website or booking page.',
      price: 15, duration: '24 hours', stripeUrl: '', capacity: 8 },
    { id: 'ig-shared', group: 'ig-shared', section: 'instagram', perCity: false,
      name: 'Shared Instagram post', description: 'Your place in a feed post with a few other good places, around a theme like new openings or brunch.',
      price: 25, duration: 'Stays on the profile', stripeUrl: '', capacity: 4 },
    { id: 'ig-own', group: 'ig-own', section: 'instagram', perCity: false,
      name: 'Your own Instagram post', description: 'One feed post fully about your place: photos, a short text and your handle tagged.',
      price: 99, duration: 'Stays on the profile', stripeUrl: '', capacity: 4 },

    { id: 'bundle-monthly', group: 'bundle', section: 'bundle', perCity: true, recurring: 'month',
      name: 'Monthly bundle', description: 'Every month: first in your list, a spot on the city page, your own Instagram post and a story.',
      price: 209, duration: 'Monthly, cancel any time', stripeUrl: '', worth: 262,
      includes: ['top-list-1', 'city-page-month', 'ig-own', 'ig-story'] }
  ]
};
