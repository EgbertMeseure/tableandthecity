/* One sender for every visitor form ("Suggest a place", "Know this place?" corrections, "Request your city").
   Visitors never need their own mail app (no mailto fallback). Two services, both delivering to info@tableandthecity.com:
   1. PRIMARY  – FormSubmit: JSON POST to TG_CONFIG.FEEDBACK_FORMSUBMIT (https://formsubmit.co/ajax/info@tableandthecity.com),
                 with _subject, _template 'basic' (plainest e-mail), _captcha 'false', _replyto (visitor's email, if given) and _honey (honeypot).
                 Success = success === true or 'true' (FormSubmit answers with strings); the "needs activation" answer counts as a failure.
   2. FALLBACK – Web3Forms: JSON POST to TG_CONFIG.FEEDBACK_ENDPOINT with the public FEEDBACK_ACCESS_KEY (botcheck honeypot),
                 used only when FormSubmit fails (network error, timeout, non-2xx, success false). Web3Forms sits behind a
                 Cloudflare managed challenge that blocks some visitors (e.g. Belgian IPs get 403 cf-mitigated: challenge), hence not primary.
   Each attempt times out after 12 s. TGForms.send({ subject, email, fields }) resolves with { via, ...answer }
   when one service accepted it and rejects only when both failed; callers then show TGForms.FAIL and keep the typed text.
   fields = only the essentials, in order, with short human labels ({ Place, City, … }); empty values are dropped, so the
   e-mail stays minimal. The Web3Forms fallback gets the same subject + fields.
   TGForms.ready → false when neither service is configured (the forms' entry points are then hidden). */
(function () {
  'use strict';
  const C = window.TG_CONFIG || {}, TIMEOUT = 12000;
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const ok = j => !!j && (j.success === true || j.success === 'true');
  async function post(url, body) {
    const ctl = 'AbortController' in window ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', ...(ctl ? { signal: ctl.signal } : {}) });
      let j = null; try { j = await res.json(); } catch (_) {}
      if (!res.ok || !ok(j)) throw new Error((j && j.message) || 'HTTP ' + res.status);
      return j;
    } finally { if (t) clearTimeout(t); }
  }
  async function send({ subject, email, fields = {} }) {
    const body = clean(fields), errors = [];                                // fields: ordered { 'Label': value }, empty ones dropped
    if (C.FEEDBACK_FORMSUBMIT) {
      try {
        const j = await post(C.FEEDBACK_FORMSUBMIT, { ...clean({ _subject: subject, _template: 'basic', _captcha: 'false', _replyto: email }), ...body, _honey: '' });
        return { via: 'formsubmit', ...j };
      } catch (e) { errors.push('formsubmit: ' + e.message); }
    }
    if (C.FEEDBACK_ENDPOINT) {
      try {
        const j = await post(C.FEEDBACK_ENDPOINT, { ...clean({ access_key: C.FEEDBACK_ACCESS_KEY, subject, replyto: email }), ...body, botcheck: '' });
        return { via: 'web3forms', ...j };
      } catch (e) { errors.push('web3forms: ' + e.message); }
    }
    throw new Error(errors.join(' | ') || 'no sender configured');
  }
  window.TGForms = { send, ready: !!(C.FEEDBACK_FORMSUBMIT || C.FEEDBACK_ENDPOINT), FAIL: 'Couldn’t send, please try again.' };
})();
