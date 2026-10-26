/* "Know an event? Tell us": a small form (same .crq sheet as "Suggest a place") opened from any [data-event-req] element
   (the line under the Events carousel, every city) or the #tell-event URL hash.
   Sent with TGForms.send (js/forms.js: FormSubmit, fallback Web3Forms → info@tableandthecity.com; same honeypot); no mail app.
   City = the city being viewed only (read-only, strict city separation). No endpoint configured → the entry points are hidden. */
(function () {
  'use strict';
  const F = window.TGForms;
  if (!F || !F.ready) { document.documentElement.classList.add('no-event-req'); return; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root = null, lastFocus = null;

  function currentCity() {
    const c = window.TGApp && TGApp.city; if (c && c.name) return c.name;
    const b = document.querySelector('[data-dd="city"]>button');
    return (b && b.textContent.trim()) || '';
  }
  function mount() {
    root = document.createElement('div'); root.className = 'crq sgp evr'; root.hidden = true;
    root.innerHTML = `<div class="crq__scrim" data-crq-close></div>
      <div class="crq__sheet" role="dialog" aria-modal="true" aria-labelledby="evr-title">
        <button class="crq__x" type="button" data-crq-close aria-label="Close">Close</button>
        <p class="crq__eyebrow">Table and the City</p>
        <h2 class="crq__t" id="evr-title">Know an event?</h2>
        <p class="crq__lead">A pop-up, a chef collab, a tasting or a food festival in <b class="evr__city"></b>? Tell us about it.</p>
        <form class="crq__form" novalidate>
          <label class="crq__f"><span>Event name</span><input name="name" type="text" required maxlength="120" autocomplete="off"></label>
          <div class="sgp__row">
            <label class="crq__f"><span>City</span><input name="city" type="text" readonly tabindex="-1" class="evr__ro" aria-readonly="true"></label>
            <label class="crq__f"><span>Date(s)</span><input name="date" type="text" required maxlength="120" autocomplete="off" placeholder="e.g. Fri 6 – Sat 7 Nov"></label>
          </div>
          <label class="crq__f"><span>Venue or place <i>(optional)</i></span><input name="venue" type="text" maxlength="200" autocomplete="off"></label>
          <label class="crq__f"><span>Link <i>(optional)</i></span><input name="link" type="text" inputmode="url" maxlength="300" autocomplete="off" placeholder="Website, Instagram or tickets"></label>
          <label class="crq__f"><span>Short description <i>(optional)</i></span><textarea name="about" rows="3" maxlength="1000" placeholder="Who’s cooking, what’s on the menu…"></textarea></label>
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
        const f = [...root.querySelectorAll('input:not(.sgp__hp):not([readonly]), textarea, button')].filter(x => x.offsetParent); if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    const form = root.querySelector('form');
    form.addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); root.querySelector('.crq__err').hidden = true; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = k => form.elements[k].value.trim().replace(/[ \t]+/g, ' ');
      const d = { name: v('name'), city: currentCity(), date: v('date'), venue: v('venue'), link: v('link'), about: v('about'), email: v('email') };
      const bad = [];
      if (!d.name) bad.push('name'); if (!d.date) bad.push('date');
      if (d.email && !form.elements.email.checkValidity()) bad.push('email');
      bad.forEach(k => form.elements[k].setAttribute('aria-invalid', 'true'));
      const err = root.querySelector('.crq__err');
      if (bad.length) {
        err.hidden = false;
        err.textContent = bad[0] === 'email' ? 'That email doesn’t look right.' : bad[0] === 'name' ? 'Please add the name of the event.' : 'Please add the date(s).';
        form.elements[bad[0]].focus(); return;
      }
      if (form.elements.botcheck.value) return thanks(d);                // honeypot filled → silently drop
      const btn = form.querySelector('.crq__send'); btn.disabled = true; btn.textContent = 'Sending…'; root.classList.add('is-sending');
      try {
        await F.send({ subject: `Event: ${d.name}${d.city ? ` (${d.city})` : ''}`, email: d.email,
          fields: { Event: d.name, City: d.city, Venue: d.venue, Date: d.date, Link: d.link, About: d.about, From: d.email } });
        thanks(d);
      } catch (_) {
        err.hidden = false; err.textContent = F.FAIL;                        // the typed text stays in the form
      } finally { btn.disabled = false; btn.textContent = 'Send'; root.classList.remove('is-sending'); }
    });
  }
  function thanks(d) {
    root.querySelector('form').hidden = true; root.querySelector('.crq__lead').hidden = true;
    const done = root.querySelector('.crq__done'); done.hidden = false;
    done.querySelector('.crq__thanks').innerHTML = `Thank you! <b>${esc(d.name)}</b> is on its way to our team.`;
    done.querySelector('button').focus();
  }
  function open(from) {
    if (!root) mount();
    lastFocus = from || document.activeElement;
    const form = root.querySelector('form'); form.reset(); form.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    root.querySelector('.crq__err').hidden = true; root.querySelector('.crq__done').hidden = true; root.querySelector('.crq__lead').hidden = false;
    const c = currentCity(); form.elements.city.value = c; root.querySelector('.evr__city').textContent = c || 'your city';
    root.hidden = false; document.documentElement.classList.add('crq-lock');
    requestAnimationFrame(() => { root.classList.add('is-open'); form.elements.name.focus({ preventScroll: true }); });
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open'); document.documentElement.classList.remove('crq-lock');
    setTimeout(() => { root.hidden = true; }, 200);
    if (location.hash === '#tell-event') history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-event-req]'); if (!t) return;
    e.preventDefault(); open(t);
  });
  const fromHash = () => { if (location.hash === '#tell-event') open(); };
  addEventListener('hashchange', fromHash);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromHash); else fromHash();
  window.TGEventReq = { open: () => open(), close };
})();
