/* "Request your city": an extra item at the bottom of the header Country ▾ / City ▾ dropdowns that opens a small form
   (Country, City, optional email). No backend: it opens a mailto: to TG_CONFIG.FEEDBACK_EMAIL – the same config value the
   "Know this place?" feedback uses, so the address changes in one place. Hook: this script tag only (index.html, restaurant.html). */
(function () {
  'use strict';
  const C = window.TG_CONFIG || {}, TO = (C.FEEDBACK_EMAIL || '').replace(/[^\w.+@-]/g, '');   // same sanitising as detail.js
  if (!TO) return;                                                         // no address configured → feature off
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root = null, lastFocus = null;

  /* add the item to every country/city list (the city list is re-rendered when another country is picked) */
  function addItems(host) {
    host.querySelectorAll('.citysel > ul').forEach(ul => {
      if (ul.querySelector('[data-city-req]')) return;
      const li = document.createElement('li'); li.className = 'crq-li';
      li.innerHTML = '<button type="button" class="ci crq-item" data-city-req>Request your city<em aria-hidden="true">+</em></button>';
      li.firstChild.addEventListener('click', () => {
        const dd = ul.closest('.citysel'); dd.classList.remove('open'); const b = dd.querySelector(':scope>button'); b.setAttribute('aria-expanded', 'false');
        open(host, b);
      });
      ul.appendChild(li);
    });
  }
  function watch() {
    document.querySelectorAll('[data-citysel]').forEach(host => {
      addItems(host);
      new MutationObserver(() => addItems(host)).observe(host, { childList: true, subtree: true });
    });
  }

  function mount() {
    root = document.createElement('div'); root.className = 'crq'; root.hidden = true;
    root.innerHTML = `<div class="crq__scrim" data-crq-close></div>
      <div class="crq__sheet" role="dialog" aria-modal="true" aria-labelledby="crq-title">
        <button class="crq__x" type="button" data-crq-close aria-label="Close">Close</button>
        <p class="crq__eyebrow">Table and the City</p>
        <h2 class="crq__t" id="crq-title">Request your city</h2>
        <p class="crq__lead">Tell us where you’d like us to go next.</p>
        <form class="crq__form" novalidate>
          <label class="crq__f"><span>Country</span><input name="country" type="text" autocomplete="country-name" required maxlength="60"></label>
          <label class="crq__f"><span>City</span><input name="city" type="text" autocomplete="address-level2" required maxlength="60"></label>
          <label class="crq__f"><span>Email <i>(optional)</i></span><input name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" placeholder="So we can tell you when it’s live"></label>
          <p class="crq__err" role="alert" hidden></p>
          <button class="pill-btn crq__send" type="submit">Send request</button>
          <p class="crq__note">Opens your mail app with the request filled in.</p>
        </form>
        <div class="crq__done" hidden><p class="crq__thanks" role="status"></p><button class="pill-btn crq__send" type="button" data-crq-close>Done</button></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target.closest('[data-crq-close]')) close(); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('input, button')].filter(x => x.offsetParent); if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    const form = root.querySelector('form');
    form.addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); root.querySelector('.crq__err').hidden = true; });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = k => form.elements[k].value.trim().replace(/\s+/g, ' ');
      const country = v('country'), city = v('city'), email = v('email');
      const bad = [['country', country], ['city', city]].filter(([, x]) => !x).map(([k]) => k);
      if (email && !form.elements.email.checkValidity()) bad.push('email');
      bad.forEach(k => form.elements[k].setAttribute('aria-invalid', 'true'));
      if (bad.length) {
        const err = root.querySelector('.crq__err'); err.hidden = false;
        err.textContent = bad.includes('email') && bad.length === 1 ? 'That email doesn’t look right.' : 'Please fill in both country and city.';
        form.elements[bad[0]].focus(); return;
      }
      const subject = `City request: ${city}, ${country}`;
      const body = `Country: ${country}\nCity: ${city}${email ? `\nEmail: ${email}` : ''}\n\n— sent from ${location.origin}${location.pathname}`;
      API.last = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      location.href = API.last;
      form.hidden = true; root.querySelector('.crq__lead').hidden = true;
      const done = root.querySelector('.crq__done'); done.hidden = false;
      done.querySelector('.crq__thanks').innerHTML = `Thank you! Your request for <b>${esc(city)}</b> is ready in your mail app — just hit send.`;
      done.querySelector('button').focus();
    });
  }
  function open(host, from) {
    if (!root) mount();
    lastFocus = from || document.activeElement;
    const form = root.querySelector('form'); form.reset(); form.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    root.querySelector('.crq__err').hidden = true; root.querySelector('.crq__done').hidden = true; root.querySelector('.crq__lead').hidden = false;
    const cur = host.querySelector('[data-dd="country"]>button');               // prefill the country shown in the header
    if (cur) form.elements.country.value = cur.textContent.trim();
    root.hidden = false; document.documentElement.classList.add('crq-lock');
    requestAnimationFrame(() => { root.classList.add('is-open'); form.elements[form.elements.country.value ? 'city' : 'country'].focus({ preventScroll: true }); });
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    setTimeout(() => { root.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  const API = window.TGCityRequest = { open: () => { const h = document.querySelector('[data-citysel]'); if (h) open(h); }, close, last: '' };
})();
