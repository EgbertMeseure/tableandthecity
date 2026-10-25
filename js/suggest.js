/* "Suggest a place": a small form (same .crq sheet as "Request your city") opened from any [data-suggest] element
   (footer, nav drawer, end of the "All places" list) or the #suggest URL hash.
   Sent with TGForms.send (js/forms.js: Web3Forms → info@tableandthecity.com); no mail app involved.
   No endpoint configured → the entry points are hidden. */
(function () {
  'use strict';
  const F = window.TGForms;
  if (!F || !F.ready) { document.documentElement.classList.add('no-suggest'); return; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = ['Restaurant', 'Café & bar', 'Breakfast', 'Bakery', 'Other'];
  let root = null, lastFocus = null;

  function currentCity() {
    const b = document.querySelector('[data-dd="city"]>button');
    return (b && b.textContent.trim()) || 'Gent';
  }
  function mount() {
    root = document.createElement('div'); root.className = 'crq sgp'; root.hidden = true;
    root.innerHTML = `<div class="crq__scrim" data-crq-close></div>
      <div class="crq__sheet" role="dialog" aria-modal="true" aria-labelledby="sgp-title">
        <button class="crq__x" type="button" data-crq-close aria-label="Close">Close</button>
        <p class="crq__eyebrow">Table and the City</p>
        <h2 class="crq__t" id="sgp-title">Suggest a place</h2>
        <p class="crq__lead">Know a table we’re missing? Tell us about it.</p>
        <form class="crq__form" novalidate>
          <label class="crq__f"><span>Place name</span><input name="name" type="text" required maxlength="100" autocomplete="off"></label>
          <div class="sgp__row">
            <label class="crq__f"><span>City</span><input name="city" type="text" required maxlength="60" autocomplete="address-level2"></label>
            <label class="crq__f"><span>Type</span><select name="type">${TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
          </div>
          <label class="crq__f"><span>Address or Google Maps link <i>(optional)</i></span><input name="where" type="text" maxlength="300" autocomplete="off"></label>
          <label class="crq__f"><span>Why it’s great <i>(optional)</i></span><textarea name="why" rows="3" maxlength="1000" placeholder="The dish, the wine list, the room…"></textarea></label>
          <label class="crq__f"><span>Your email <i>(optional)</i></span><input name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" placeholder="Only if you’d like a reply"></label>
          <input name="botcheck" type="text" tabindex="-1" autocomplete="off" class="sgp__hp" aria-hidden="true">
          <p class="crq__err" role="alert" hidden></p>
          <button class="pill-btn crq__send" type="submit">Send</button>
          <p class="crq__note">Goes straight to our team.</p>
        </form>
        <div class="crq__done" hidden><p class="crq__thanks" role="status"></p><button class="pill-btn crq__send" type="button" data-crq-close>Done</button></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target.closest('[data-crq-close]')) close(); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('input:not(.sgp__hp), select, textarea, button')].filter(x => x.offsetParent); if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    const form = root.querySelector('form');
    form.addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); root.querySelector('.crq__err').hidden = true; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = k => form.elements[k].value.trim().replace(/[ \t]+/g, ' ');
      const d = { name: v('name'), city: v('city'), type: v('type'), where: v('where'), why: v('why'), email: v('email') };
      const bad = [];
      if (!d.name) bad.push('name'); if (!d.city) bad.push('city');
      if (d.email && !form.elements.email.checkValidity()) bad.push('email');
      bad.forEach(k => form.elements[k].setAttribute('aria-invalid', 'true'));
      const err = root.querySelector('.crq__err');
      if (bad.length) {
        err.hidden = false;
        err.textContent = bad[0] === 'email' ? 'That email doesn’t look right.' : bad.includes('name') ? 'Please add the name of the place.' : 'Please add the city.';
        form.elements[bad[0]].focus(); return;
      }
      if (form.elements.botcheck.value) return thanks(d);                // honeypot filled → silently drop
      const message = [`Place: ${d.name}`, `City: ${d.city}`, `Type: ${d.type}`, d.where && `Address / map: ${d.where}`, d.why && `Why it's great:\n${d.why}`,
        d.email && `Email: ${d.email}`].filter(Boolean).join('\n');
      const btn = form.querySelector('.crq__send'); btn.disabled = true; btn.textContent = 'Sending…'; root.classList.add('is-sending');
      try {
        await F.send({ kind: 'Suggest a place', subject: `Suggestion: ${d.name} (${d.city})`, email: d.email,
          fields: { place_name: d.name, city: d.city, place_type: d.type, address_or_map: d.where, why: d.why }, message });
        thanks(d);
      } catch (_) {
        err.hidden = false; err.textContent = F.FAIL;                        // the typed text stays in the form
      } finally { btn.disabled = false; btn.textContent = 'Send'; root.classList.remove('is-sending'); }
    });
  }
  function thanks(d) {
    root.querySelector('form').hidden = true; root.querySelector('.crq__lead').hidden = true;
    const done = root.querySelector('.crq__done'); done.hidden = false;
    done.querySelector('.crq__thanks').innerHTML = `Thank you! Your suggestion for <b>${esc(d.name)}</b> is on its way to our team.`;
    done.querySelector('button').focus();
  }
  function open(from) {
    if (!root) mount();
    lastFocus = from || document.activeElement;
    const form = root.querySelector('form'); form.reset(); form.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    root.querySelector('.crq__err').hidden = true; root.querySelector('.crq__done').hidden = true; root.querySelector('.crq__lead').hidden = false;
    form.elements.city.value = currentCity();
    root.hidden = false; document.documentElement.classList.add('crq-lock');
    requestAnimationFrame(() => { root.classList.add('is-open'); form.elements.name.focus({ preventScroll: true }); });
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    setTimeout(() => { root.hidden = true; }, 200);
    if (location.hash === '#suggest') history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-suggest]'); if (!t) return;
    e.preventDefault(); open(t);
  });
  const fromHash = () => { if (location.hash === '#suggest') open(); };
  addEventListener('hashchange', fromHash);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromHash); else fromHash();
  const API = window.TGSuggest = { open: () => open(), close };
})();
