/* Optional runtime config (visible to every visitor — never put secrets here).
   googleMapsKey: leave empty to keep Google Places Photos OFF. If set, use a *browser* key restricted by HTTP referrer
   (tableandthecity.com/*) and to the Places API (New) only. See README.
   FEEDBACK_ENDPOINT: URL that accepts a JSON POST for "Know this place?" feedback (e.g. https://api.web3forms.com/submit
   or https://formspree.io/f/<id>); FEEDBACK_ACCESS_KEY: the form's public access key (Web3Forms), if the service needs one;
   FEEDBACK_EMAIL: address for the "Email us" button and the mailto fallback. Empty = feature off / button hidden. */
/* igCardEmbeds: true = list cards of places whose only photo is on Instagram show it via Instagram's official embed (lazy: only after the
   card has been on screen for 0.3 s, max 3 loading at once, skipped with Data Saver / slow connections). Each such card costs ≈ 1 MB.
   false = those cards show the monogram; Instagram then only appears on detail pages. */
window.TG_CONFIG = { igCardEmbeds: true, googleMapsKey: '', FEEDBACK_ENDPOINT: '', FEEDBACK_ACCESS_KEY: '', FEEDBACK_EMAIL: 'hello@tableandthecity.com' };
/* ⚠ PLACEHOLDER: hello@tableandthecity.com is NOT a real inbox yet (the domain is not owned/configured). Mails sent to it bounce/are lost.
   Replace FEEDBACK_EMAIL with a real address as soon as one exists (or set FEEDBACK_ENDPOINT to a form service). */
