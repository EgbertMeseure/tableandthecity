/* "Spotted something off? Let us know" on a place page (At a glance): a small form (same .crq sheet as "Know an event?").
   Reason (required) + optional note + optional email, sent with TGForms.send (js/forms.js: FormSubmit, fallback Web3Forms →
   info@tableandthecity.com). The e-mail carries only place, city, page URL, reason, note (+ reply address). Never changes data. */
(function () {
  'use strict';
  const F = window.TGForms;
  if (!F || !F.ready) return;
  const REASONS = ['Doesn’t belong in the guide', 'Info is wrong (e.g. hours, price level, quality)', 'Closed', 'Other'];
  let root = null, lastFocus = null, cur = {};
  function mount() {
    root = document.createElement('div'); root.className = 'crq sgp rpt'; root.hidden = true;
    root.innerHTML = `<div class="crq__scrim" data-crq-close></div>
      <div class="crq__sheet" role="dialog" aria-modal="true" aria-labelledby="rpt-title">
        <button class="crq__x" type="button" data-crq-close aria-label="Close">Close</button>
        <p class="crq__eyebrow">Table and the City</p>
        <h2 class="crq__t" id="rpt-title">Spotted something off?</h2>
        <p class="crq__lead">Tell us what’s not right about <b class="rpt__place"></b>.</p>
        <form class="crq__form" novalidate>
          <label class="crq__f"><span>Reason</span><select name="reason" required><option value="">Choose…</option>${REASONS.map(r => `<option>${r}</option>`).join('')}</select></label>
          <label class="crq__f"><span>Note <i>(optional)</i></span><textarea name="note" rows="3" maxlength="1000" placeholder="What should it say?"></textarea></label>
          <label class="crq__f"><span>Your email <i>(optional)</i></span><input name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" placeholder="Only if you’d like a reply"></label>
          <input name="botcheck" type="text" tabindex="-1" autocomplete="off" class="sgp__hp" aria-hidden="true">
          <p class="crq__err" role="alert" hidden></p>
          <button class="pill-btn crq__send" type="submit">Send</button>
          <p class="crq__note">Goes straight to our team.</p>
        </form>
        <div class="crq__done" hidden><p class="crq__thanks" role="status">Thank you! We’ll take a look.</p><button class="pill-btn crq__send" type="button" data-crq-close>Done</button></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target.closest('[data-crq-close]')) close(); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    const form = root.querySelector('form');
    form.addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); root.querySelector('.crq__err').hidden = true; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = k => form.elements[k].value.trim();
      const d = { reason: v('reason'), note: v('note'), email: v('email') }, err = root.querySelector('.crq__err');
      const bad = !d.reason ? 'reason' : d.email && !form.elements.email.checkValidity() ? 'email' : '';
      if (bad) { form.elements[bad].setAttribute('aria-invalid', 'true'); err.hidden = false;
        err.textContent = bad === 'reason' ? 'Please choose a reason.' : 'That email doesn’t look right.'; form.elements[bad].focus(); return; }
      if (form.elements.botcheck.value) return done();
      const btn = form.querySelector('.crq__send'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await F.send({ subject: `Correction: ${cur.place}${cur.city ? ` (${cur.city})` : ''}`, email: d.email,
          fields: { Place: cur.place, City: cur.city, Page: location.href, Reason: d.reason, Note: d.note, From: d.email } });
        done();
      } catch (_) { err.hidden = false; err.textContent = F.FAIL; }
      finally { btn.disabled = false; btn.textContent = 'Send'; }
    });
  }
  function done() { root.querySelector('form').hidden = true; root.querySelector('.crq__lead').hidden = true;
    const d = root.querySelector('.crq__done'); d.hidden = false; d.querySelector('button').focus(); }
  function open(t) {
    if (!root) mount();
    lastFocus = t; cur = { place: t.dataset.place || '', city: t.dataset.city || '' };
    const form = root.querySelector('form'); form.reset(); form.hidden = false;
    root.querySelector('.crq__err').hidden = true; root.querySelector('.crq__done').hidden = true; root.querySelector('.crq__lead').hidden = false;
    root.querySelector('.rpt__place').textContent = cur.place || 'this place';
    root.hidden = false; document.documentElement.classList.add('crq-lock');
    requestAnimationFrame(() => { root.classList.add('is-open'); form.elements.reason.focus({ preventScroll: true }); });
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    setTimeout(() => { root.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-report]'); if (!t) return; e.preventDefault(); open(t); });
})();
