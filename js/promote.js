/* "Promote your place" (promote.html): a contact form for sponsored spots, sent with TGForms.send (js/forms.js: FormSubmit,
   fallback Web3Forms → info@tableandthecity.com), the same sender as "Suggest a place". No sender configured → the plain address stays. */
(function () {
  'use strict';
  const F = window.TGForms, form = document.getElementById('pr-form'); if (!form) return;
  const q = new URLSearchParams(location.search), city = /^[a-z0-9-]{1,40}$/.test(q.get('city') || '') ? q.get('city') : '';
  const g = document.getElementById('pr-guide'); if (g && city) g.href = `guide.html?${q.get('country') ? `country=${encodeURIComponent(q.get('country'))}&` : ''}city=${city}`;
  if (!F || !F.ready) return;                                      // no form service: only the address is shown
  form.hidden = false; document.getElementById('pr-nojs').hidden = true;
  if (city) fetch('data/cities.json').then(r => r.json()).then(cfg => {           // prefill the city of the guide the visitor came from
    for (const co of cfg.countries || []) for (const c of co.cities || []) if (c.id === city && !form.elements.city.value) form.elements.city.value = c.nameEn || c.name;
  }).catch(() => {});
  const err = form.querySelector('.pr-err');
  form.addEventListener('input', e => { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); err.hidden = true; });
  const t = s => (window.TG_I18N && TG_I18N.t ? TG_I18N.t(s) : s);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = k => form.elements[k].value.trim().replace(/[ \t]+/g, ' ');
    const d = { business: v('business'), city: v('city'), contact: v('contact'), email: v('email'), message: v('message'),
      spots: [...form.querySelectorAll('input[name="spot"]:checked')].map(x => x.value) };
    const bad = ['business', 'city', 'contact', 'email'].filter(k => !d[k]);
    if (d.email && !form.elements.email.checkValidity()) bad.push('email');
    bad.forEach(k => form.elements[k].setAttribute('aria-invalid', 'true'));
    if (bad.length) {
      err.hidden = false;
      err.textContent = t(bad.includes('email') && d.email ? 'That email doesn’t look right.' : 'Please fill in the business name, city, your name and email.');
      form.elements[bad[0]].focus(); return;
    }
    if (form.elements.botcheck.value) return done();                // honeypot filled → silently drop
    const btn = form.querySelector('.pr-send'); btn.disabled = true; btn.textContent = t('Sending…');
    try {
      await F.send({ subject: `Promote your place: ${d.business}`, email: d.email,
        fields: { Business: d.business, City: d.city, Contact: d.contact, Email: d.email, Spots: d.spots.join(', '), Message: d.message } });
      done();
    } catch (_) { err.hidden = false; err.textContent = t(F.FAIL); }
    finally { btn.disabled = false; btn.textContent = t('Send'); }
  });
  function done() { form.hidden = true; const x = document.getElementById('pr-done'); x.hidden = false; x.querySelector('p').focus && x.setAttribute('tabindex', '-1'); x.focus(); }
})();
