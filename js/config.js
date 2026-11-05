/* Optional runtime config (visible to every visitor — never put secrets here).
   googleMapsKey: leave empty to keep Google Places Photos OFF. If set, use a *browser* key restricted by HTTP referrer
   (tableandthecity.com/*) and to the Places API (New) only. See README.
   FEEDBACK_FORMSUBMIT: primary sender for every visitor form (js/forms.js): FormSubmit's AJAX URL for info@tableandthecity.com.
   FEEDBACK_ENDPOINT + FEEDBACK_ACCESS_KEY: fallback sender (Web3Forms, also delivering to info@), used only when FormSubmit fails.
   The access key is public by design (it can only send to that inbox). Both empty = the forms ("Suggest a place",
   "Know this place?", "Request your city") are hidden. There is no mailto fallback.
   FEEDBACK_EMAIL: the site's contact address (info@tableandthecity.com), for reference only; visitors never get a mailto. */
/* igCardEmbeds: true = list cards of places whose only photo is on Instagram show it via Instagram's official embed (lazy: only after the
   card has been on screen for 0.3 s, max 3 loading at once, skipped with Data Saver / slow connections). Each such card costs ≈ 1 MB.
   false = those cards show the monogram (the default since the one-photo-layout change: no Instagram embeds on cards or place pages). */
/* BOOKING_BUTTON_TYPES: restaurant categories whose list cards show the booking button ("Check availability ↗" for an online
   booking link, "Reservation by phone" as a tel: link, or a "Walk-in only" chip) instead of the small "Reserve ↗" link.
   Add a category to extend it (e.g. 'gastro-bistro', 'bistro', 'brasserie', 'casual'), or '*' for all restaurants. */
/* igProfileEmbeds: false = never show Instagram's profile-grid embed (it shows whatever the place posted last, often people);
   only reviewed single posts (food / drinks / interior) are shown. */
window.TG_CONFIG = { BOOKING_BUTTON_TYPES: ['fine dining'], igCardEmbeds: false, igProfileEmbeds: false, googleMapsKey: '', FEEDBACK_FORMSUBMIT: 'https://formsubmit.co/ajax/info@tableandthecity.com', FEEDBACK_ENDPOINT: 'https://api.web3forms.com/submit', FEEDBACK_ACCESS_KEY: 'd45080e6-45bf-4063-a51d-61f998e37d40', FEEDBACK_EMAIL: 'info@tableandthecity.com' };
