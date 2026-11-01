/* Table and the City – "Promote your place" packages (promote.html, preview only: not linked from the site, noindex).
   ONE place to edit prices and payment links. Every entry is one thing a place can buy = one Stripe Payment Link.
     id          unique, lowercase (sent to Stripe as part of client_reference_id: <city>__<id>)
     group       entries with the same group share one card on the page; the duration chips switch between them
     name        card title (English; translations in scripts/i18n_strings.txt)
     description one or two plain sentences (English; translated the same way)
     price       EUR, EXCLUDING 21% VAT (BTW). The page shows it as "excl. VAT" plus the incl. 21% amount
     duration    chip label ('1 week', '1 month', …); also translated
     stripeUrl   the Stripe Payment Link (https://buy.stripe.com/…). Empty = the button shows a disabled "Coming soon"
     perCity     true = bought for one city (the city picked on the page goes to Stripe in client_reference_id)
   Prices are launch SUGGESTIONS (see the README in the handoff folder) — review before going live. */
window.TG_PROMOTE = {
  currency: 'EUR',
  vatRate: 0.21,
  cities: ['gent', 'antwerpen', 'brussel', 'brugge', 'oostende'],
  packages: [
    { id: 'top-list-week', group: 'top-list', section: 'guide', perCity: true,
      name: 'Top of the list', description: 'Your place pinned first in its category list in one city, marked Promoted.',
      price: 19, duration: '1 week', stripeUrl: '' },
    { id: 'top-list-month', group: 'top-list', section: 'guide', perCity: true,
      name: 'Top of the list', description: 'Your place pinned first in its category list in one city, marked Promoted.',
      price: 59, duration: '1 month', stripeUrl: '' },

    { id: 'city-page-week', group: 'city-page', section: 'guide', perCity: true,
      name: 'Top of the city page', description: 'One of four places in the Featured row at the top of the city page, the first thing visitors see.',
      price: 39, duration: '1 week', stripeUrl: '' },
    { id: 'city-page-month', group: 'city-page', section: 'guide', perCity: true,
      name: 'Top of the city page', description: 'One of four places in the Featured row at the top of the city page, the first thing visitors see.',
      price: 119, duration: '1 month', stripeUrl: '' },
    { id: 'city-page-group', group: 'city-page', section: 'guide', perCity: true,
      name: 'Top of the city page', description: 'Three places of the same owner or group together in the Featured row for a month.',
      price: 299, duration: '3 places, 1 month', stripeUrl: '' },

    { id: 'ig-story', group: 'ig-story', section: 'instagram', perCity: false,
      name: 'Instagram story', description: 'A story on @tableandthecity about your place, with a link sticker to your website or booking page.',
      price: 29, duration: '24 hours', stripeUrl: '' },
    { id: 'ig-shared', group: 'ig-shared', section: 'instagram', perCity: false,
      name: 'Shared Instagram post', description: 'Your place in a feed post with a few other good places, around a theme like new openings or brunch.',
      price: 49, duration: 'Stays on the profile', stripeUrl: '' },
    { id: 'ig-own', group: 'ig-own', section: 'instagram', perCity: false,
      name: 'Your own Instagram post', description: 'One feed post fully about your place: photos, a short text and your handle tagged.',
      price: 99, duration: 'Stays on the profile', stripeUrl: '' },

    { id: 'bundle-spotlight', group: 'bundle', section: 'bundle', perCity: true,
      name: 'Spotlight bundle', description: 'Your own Instagram post and a story, a month at the top of your list and a week on the city page.',
      price: 179, duration: 'Spread over one month', stripeUrl: '', worth: 226 }
  ]
};
