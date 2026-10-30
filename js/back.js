/* "Back" at the top left of the subpages (restaurant.html, about.html, privacy.html), in place of the logo: goes to the previous page with
   history.back() when that page is on this site (the guide then restores its filters + scroll, js/app.js), otherwise to the city guide
   (?country=&city= of this page, or the last city viewed; the landing when none is known). Hook: <a data-back> + this script. */
(function () {
  'use strict';
  const a = document.querySelector('[data-back]'); if (!a) return;
  const q = new URLSearchParams(location.search), ok = s => (/^[a-z0-9-]{1,40}$/.test(s || '') ? s : '');
  let city = ok(q.get('city')), country = ok(q.get('country'));
  if (!city) { try { city = ok(localStorage.getItem('tatc.lastCity')); } catch (e) {} country = ''; }
  a.href = city ? `guide.html?${country ? `country=${country}&` : ''}city=${city}` : './';
  a.addEventListener('click', e => {
    let ref = null; try { ref = document.referrer ? new URL(document.referrer) : null; } catch (_) {}
    const prevOnSite = ref && ref.origin === location.origin && ref.pathname + ref.search !== location.pathname + location.search;
    if (prevOnSite && history.length > 1) { e.preventDefault(); history.back(); }
  });
})();
