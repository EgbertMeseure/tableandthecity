/* Optional runtime config (visible to every visitor — never put secrets here).
   googleMapsKey: leave empty to keep Google Places Photos OFF. If set, use a *browser* key restricted by HTTP referrer
   (tableandthecity.com/*) and to the Places API (New) only. See README.
   FEEDBACK_ENDPOINT: URL that accepts a JSON POST for "Know this place?" feedback (e.g. https://api.web3forms.com/submit
   or https://formspree.io/f/<id>); FEEDBACK_ACCESS_KEY: the form's public access key (Web3Forms), if the service needs one;
   FEEDBACK_EMAIL: address for the "Email us" button and the mailto fallback. Empty = feature off / button hidden. */
/* igCardEmbeds: true = list cards of places whose only photo is on Instagram show it via Instagram's official embed (lazy: only after the
   card has been on screen for 0.3 s, max 3 loading at once, skipped with Data Saver / slow connections). Each such card costs ≈ 1 MB.
   false = those cards show the monogram; Instagram then only appears on detail pages. */
/* BOOKING_BUTTON_TYPES: restaurant categories whose list cards show the booking button ("Check availability ↗" for an online
   booking link, "Reservation by phone" as a tel: link, or a "Walk-in only" chip) instead of the small "Reserve ↗" link.
   Add a category to extend it (e.g. 'gastro-bistro', 'bistro', 'brasserie', 'casual'), or '*' for all restaurants. */
window.TG_CONFIG = { BOOKING_BUTTON_TYPES: ['fine dining'], igCardEmbeds: true, googleMapsKey: '', FEEDBACK_ENDPOINT: '', FEEDBACK_ACCESS_KEY: '', FEEDBACK_EMAIL: 'meseure.egbert@gmail.com' };
