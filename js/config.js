/* Optional runtime config (visible to every visitor — never put secrets here).
   googleMapsKey: leave empty to keep Google Places Photos OFF. If set, use a *browser* key restricted by HTTP referrer
   (tableandthecity.com/*) and to the Places API (New) only. See README.
   FEEDBACK_ENDPOINT: URL that accepts a JSON POST for "Know this place?" feedback (e.g. https://api.web3forms.com/submit
   or https://formspree.io/f/<id>); FEEDBACK_ACCESS_KEY: the form's public access key (Web3Forms), if the service needs one;
   FEEDBACK_EMAIL: address for the "Email us" button and the mailto fallback. Empty = feature off / button hidden. */
window.TG_CONFIG = { googleMapsKey: '', FEEDBACK_ENDPOINT: '', FEEDBACK_ACCESS_KEY: '', FEEDBACK_EMAIL: 'hello@tableandthecity.com' };
/* ⚠ PLACEHOLDER: hello@tableandthecity.com is NOT a real inbox yet (the domain is not owned/configured). Mails sent to it bounce/are lost.
   Replace FEEDBACK_EMAIL with a real address as soon as one exists (or set FEEDBACK_ENDPOINT to a form service). */
