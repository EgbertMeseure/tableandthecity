/* One sender for every visitor form ("Suggest a place", "Know this place?" corrections, "Request your city"):
   a JSON POST to TG_CONFIG.FEEDBACK_ENDPOINT (Web3Forms, delivering to info@tableandthecity.com). There is no mailto
   fallback: visitors never need their own mail app. The Web3Forms access key is public by design (it only allows sending
   to the inbox it was created for), so it can live in js/config.js.

   TGForms.send({ kind, subject, email, fields, message }) → Promise that resolves on { success: true }, rejects otherwise
   (network error, timeout after 15 s, non-2xx, or success:false). Callers keep the typed text on failure.
   TGForms.ready → false when no endpoint is configured (the forms' entry points are then hidden). */
(function () {
  'use strict';
  const C = window.TG_CONFIG || {};
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  async function send({ kind, subject, email, fields = {}, message = '' }) {
    if (!C.FEEDBACK_ENDPOINT) throw new Error('no endpoint');
    const ctl = 'AbortController' in window ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 15000);
    const body = clean({
      access_key: C.FEEDBACK_ACCESS_KEY, subject, from_name: 'Table and the City website', form_type: kind,
      replyto: email, email, ...fields, message, page: location.href.split('#')[0], sent_at: new Date().toISOString()
    });
    body.botcheck = '';                                   // Web3Forms honeypot (must stay empty; bots caught client-side are dropped before this)
    try {
      const res = await fetch(C.FEEDBACK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', ...(ctl ? { signal: ctl.signal } : {}) });
      let j = null; try { j = await res.json(); } catch (_) {}
      if (!res.ok || (j && j.success === false)) throw new Error((j && j.message) || 'HTTP ' + res.status);
      return j || { success: true };
    } finally { if (t) clearTimeout(t); }
  }
  window.TGForms = { send, ready: !!C.FEEDBACK_ENDPOINT, FAIL: 'Couldn’t send, please try again.' };
})();
