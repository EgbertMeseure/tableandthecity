/* Table and the City – landing page (index.html, the site root; world.html forwards here).
   Globe (three.js, vendor/three) → country (Belgium) → city cards → the city guide (guide.html?country=&city=).
   Data: data/cities.json (names, active flags, centres, hero photos) + data/landing.json (globe dots, per-city tagline + showcase photos).
   The country state lives in history.state (URL stays the bare /, no #hash), so Back still returns to the globe. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BUILD = (document.querySelector('meta[name="build"]') || {}).content || '';
const bust = u => BUILD ? u + (u.includes('?') ? '&' : '?') + 'v=' + BUILD : u;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAST_KEY = 'tatc.lastCity';
const guideUrl = (co, id, hash = '') => `guide.html?country=${encodeURIComponent(co)}&city=${encodeURIComponent(id)}${hash}`;

const getJSON = u => fetch(bust(u), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const [CFG, LAND] = await Promise.all([getJSON('data/cities.json'), getJSON('data/landing.json').catch(() => ({ countries: [], cities: {} }))]);
let CREDITS = null;
const credits = () => CREDITS || (CREDITS = getJSON('img/CREDITS.json').catch(() => []));

/* ---------- model ---------- */
const COUNTRIES = CFG.countries.map(co => {
  const L = (LAND.countries || []).find(x => x.id === co.id) || {};
  const cities = co.cities.map(c => ({ ...c, countryId: co.id, land: (LAND.cities || {})[c.id] || {} }));
  const act = cities.filter(c => c.active && c.center);
  const dot = L.dot || (act.length ? [act.reduce((s, c) => s + c.center[0], 0) / act.length, act.reduce((s, c) => s + c.center[1], 0) / act.length] : null);
  return { id: co.id, name: co.name, active: !!co.active, dot, cities, act };
});
const ACTIVE = COUNTRIES.filter(c => c.active && c.act.length);
const cityById = id => { for (const co of COUNTRIES) { const c = co.cities.find(x => x.id === id); if (c) return [co, c]; } return [null, null]; };
const focus = c => c.images && c.images.heroFocus ? ` style="object-position:${esc(c.images.heroFocus)}"` : '';   // cities.json images.heroFocus (e.g. Ostend '12% 50%') keeps the subject in narrow crops
const heroSet = (b, sizes = '100vw') => `src="${esc(b)}-1600.jpg" srcset="${esc(b)}-1000.webp 1000w, ${esc(b)}-1600.webp 1600w, ${esc(b)}-2400.webp 2400w" sizes="${sizes}"`;

/* ---------- static UI: destinations list, cards, resume ---------- */
$('#wl-dest-list').innerHTML = COUNTRIES.map(co => `<h3>${esc(co.name)}${co.active ? '' : ' · coming soon'}</h3><ul>${co.cities.map(c => c.active
  ? `<li><a href="${guideUrl(co.id, c.id)}" data-city="${esc(c.id)}">${esc(c.name)}</a></li>`
  : `<li><span>${esc(c.name)} <em>soon</em></span></li>`).join('')}</ul>`).join('') +
  `<p class="wl-dest__note">Starting in Belgium, growing to every great food city in the world.</p>`;

function renderCards(co) {
  $('#wl-panel-title').textContent = co.name;
  $('#wl-cards').innerHTML = co.act.map(c => `<li><a class="wl-card" href="${guideUrl(co.id, c.id)}" data-city="${esc(c.id)}">
    ${c.images && c.images.hero ? `<img ${heroSet(c.images.hero, '(max-width:760px) 100vw, 470px')}${focus(c)} alt="" loading="lazy" decoding="async">` : ''}
    <span class="wl-card__txt"><span class="wl-card__name">${esc(c.name)}</span>${c.land.tagline ? `<span class="wl-card__tag">${esc(c.land.tagline)}</span>` : ''}</span>
    <span class="wl-card__go" aria-hidden="true">→</span></a></li>`).join('');
}

let last = null; try { last = localStorage.getItem(LAST_KEY); } catch (e) {}
{ const [co, c] = cityById(last); if (c && c.active) { const a = $('#wl-resume'); a.href = guideUrl(co.id, c.id); $('#wl-resume-city').textContent = c.name; a.hidden = false; } }
const remember = id => { try { localStorage.setItem(LAST_KEY, id); } catch (e) {} };
document.addEventListener('click', e => { const a = e.target.closest('a[href^="guide.html"]'); if (a) { const m = /[?&]city=([a-z-]+)/.exec(a.getAttribute('href')); if (m) remember(m[1]); } });

/* destinations dialog */
const dest = $('#wl-dest'), listBtn = $('#wl-listbtn');
function openDest(on) { dest.classList.toggle('is-open', on); listBtn.setAttribute('aria-expanded', on); if (on) dest.focus(); else listBtn.focus(); }
listBtn.addEventListener('click', () => openDest(!dest.classList.contains('is-open')));
$('#wl-dest-close').addEventListener('click', () => openDest(false));
dest.addEventListener('click', e => { if (e.target === dest) openDest(false); });

/* photo credits panel (built from img/CREDITS.json: globe textures, each city's hero from cities.json, each showcase photo from landing.json) */
const creds = $('#wl-creds'); let credsFrom = null;
async function openCreds(on) {
  if (!on) { creds.classList.remove('is-open'); if (credsFrom) credsFrom.focus(); return; }
  credsFrom = document.activeElement; creds.classList.add('is-open'); creds.focus();
  const cr = await credits(); const by = pre => cr.find(x => x.file && x.file.startsWith(pre));
  const line = (what, e) => e ? `<li><b>${esc(what)}</b> · ${esc(e.photographer || '')}${e.source ? ` · <a href="${esc(e.source)}" target="_blank" rel="noopener">source</a>` : ''} · ${e.license_url ? `<a href="${esc(e.license_url)}" target="_blank" rel="noopener">${esc((e.license || '').split(' (')[0])}</a>` : esc((e.license || '').split(' (')[0])}${e.changes ? ` · ${esc(e.changes)}` : ''}</li>` : '';
  let h = `<h3>The globe</h3><ul>${cr.filter(x => x.file && x.file.startsWith('img/world/')).map(e => line(e.title || 'NASA texture', e)).join('')}</ul>`;
  for (const co of ACTIVE) for (const c of co.act) {
    const hero = c.images && c.images.hero ? line(`${c.name}: hero`, by(c.images.hero)) : '';
    const imgs = (c.land.images || []).filter(im => im.src.startsWith(`img/cities/${c.id}/landing/`)).map(im => line(im.caption, by(im.src + '-'))).join('');
    if (hero || imgs) h += `<h3>${esc(c.name)}</h3><ul>${hero}${imgs}</ul>`;
  }
  $('#wl-creds-list').innerHTML = h;
}
document.addEventListener('click', e => { const a = e.target.closest('[data-credits]'); if (a) { e.preventDefault(); openCreds(true); return; }
  if (e.target.closest('[data-creds-close]') || e.target === creds) openCreds(false); });
creds.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); openCreds(false); } });

/* ---------- globe ---------- */
let G = null;
const canvas = $('#wl-globe');
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
if (hasWebGL()) {
  try { G = await initGlobe(); document.documentElement.classList.add('has-gl'); }
  catch (e) { console.warn('Globe unavailable, showing the list', e); G = null; }
}
if (!G) { document.documentElement.classList.add('no-webgl'); $('#wl-hint').hidden = true; canvas.remove(); }

async function initGlobe() {
  const THREE = await import('../vendor/three/three.custom.min.js');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x040506, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  const R = 1;
  const small = () => innerWidth <= 760;
  const loader = new THREE.TextureLoader();
  const tex = u => new Promise((ok, no) => loader.load(u, t => { t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); ok(t); }, undefined, no));
  const big = !small() && renderer.capabilities.maxTextureSize >= 4096;
  const [night, day] = await Promise.all([tex(big ? 'img/world/earth-night-4096.jpg' : 'img/world/earth-night-2048.jpg'), tex('img/world/earth-day-2048.jpg')]);

  const sun = new THREE.Vector3(0.62, 0.55, -0.56).normalize();   // fixed relative to the camera: the lit rim sits top-right, like the reference
  const globe = new THREE.Group(); scene.add(globe);
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: night }, uDay: { value: day }, uSun: { value: sun }, uFocus: { value: new THREE.Vector3(0, 0, 1) }, uFocusAmt: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vL;
      void main(){ vUv=uv; vL=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uNight; uniform sampler2D uDay; uniform vec3 uSun; uniform vec3 uFocus; uniform float uFocusAmt;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vL;
      void main(){
        vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vP);
        vec3 nt=texture2D(uNight,vUv).rgb; vec3 dy=texture2D(uDay,vUv).rgb;
        float L=dot(nt,vec3(.299,.587,.114));
        float lit=pow(smoothstep(.08,.9,L),1.15);
        vec3 lights=mix(vec3(1.,.70,.34),vec3(1.,.93,.78),smoothstep(.55,1.,L))*lit*1.85;
        lights+=vec3(.55,.42,.95)*smoothstep(.62,1.,L)*.22;                  /* a hint of violet in the brightest cores */
        vec3 base=dy*vec3(.10,.16,.22)+vec3(.006,.014,.02);                     /* moonlit land & ocean */
        float s=dot(N,uSun); float dayAmt=smoothstep(-.05,.5,s);
        vec3 col=base+lights*(1.-dayAmt*.9);
        col=mix(col,dy*1.08+vec3(.01,.02,.03),dayAmt*.92);
        col+=vec3(1.,.62,.30)*.10*exp(-pow((s+.02)/.10,2.));                  /* warm terminator */
        float f=pow(1.-max(dot(N,V),0.),2.6);
        col+=mix(vec3(.16,.40,.48),vec3(.55,.70,.85),dayAmt)*f*.75;            /* petrol rim */
        float fd=dot(normalize(vL),uFocus); col+=vec3(1.,.78,.40)*uFocusAmt*.10*smoothstep(.9975,.9999,fd); /* soft glow over the chosen country */
        gl_FragColor=vec4(col,1.);
      }`
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), earthMat); globe.add(earth);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun } }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(normalMatrix*normal); vW=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
      void main(){ float i=pow(clamp(.74-dot(vN,vec3(0.,0.,1.)),0.,1.),4.2)*1.25; float s=clamp(dot(-vW,uSun)*.5+.5,0.,1.);
        vec3 c=mix(vec3(.10,.24,.34),vec3(.42,.46,.86),s*s); gl_FragColor=vec4(c*i,i); }`
  }));
  scene.add(atmo);

  /* stars */
  { const n = 1800, pos = [], sz = [], tw = [];
    for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 60 + Math.random() * 30, q = Math.sqrt(1 - u * u);
      pos.push(r * q * Math.cos(t), r * u, r * q * Math.sin(t) - 20); sz.push(Math.random() < .06 ? 2.2 + Math.random() * 1.4 : .7 + Math.random() * 1.2); tw.push(Math.random() * 6.28); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.Float32BufferAttribute(sz, 1)); g.setAttribute('ph', new THREE.Float32BufferAttribute(tw, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uPR: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; attribute float ph; uniform float uT; uniform float uPR; varying float vA;
        void main(){ vA=.35+.35*sin(uT*.8+ph)+.3*step(2.,size); gl_PointSize=size*uPR; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(1.,.97,.9),vA*smoothstep(.5,.0,d)); }` });
    var stars = new THREE.Points(g, m); scene.add(stars); }

  /* sun flare sprite (a soft glow with thin rays, peeking over the limb) */
  const flare = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    let g = x.createRadialGradient(256, 256, 0, 256, 256, 256); g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(.05, 'rgba(255,246,225,.95)'); g.addColorStop(.16, 'rgba(255,214,160,.35)'); g.addColorStop(.42, 'rgba(120,160,200,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512); x.globalCompositeOperation = 'lighter';
    [[0, 1], [Math.PI / 2, .7], [Math.PI / 4, .35], [-Math.PI / 4, .35]].forEach(([a, k]) => { x.save(); x.translate(256, 256); x.rotate(a);
      const l = x.createLinearGradient(-256, 0, 256, 0); l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(.5, `rgba(255,248,232,${.55 * k})`); l.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = l; x.fillRect(-256, -1.2, 512, 2.4); x.restore(); });
    const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .95 }));
    scene.add(s); return s; })();

  /* coordinates (three.js sphere UVs: u=0 at lon -180) */
  const D2R = Math.PI / 180;
  const ll2v = (lat, lon, r = R) => { const p = lat * D2R, t = (lon + 180) * D2R; return new THREE.Vector3(-Math.cos(t) * Math.cos(p) * r, Math.sin(p) * r, Math.sin(t) * Math.cos(p) * r); };
  const facing = (lat, lon) => ({ x: lat * D2R, y: (-90 - lon) * D2R });

  /* view state (eased towards targets) */
  const S = { rx: .42, ry: 0, dist: 4, ox: 0, oy: 0, focus: 0 }, T = { ...S };
  { const f = facing(42, 18); S.rx = T.rx = f.x; S.ry = T.ry = f.y - .5; }   // open on Europe & Asia, as in the reference
  let mode = 'globe', vx = 0, vy = 0, drag = null, lastInteract = 0, W = 1, H = 1, focusCountry = null;
  const fovT = Math.tan(17.5 * D2R);
  const distFor = rpx => Math.sqrt(Math.pow(R * (H / (2 * fovT)) / rpx, 2) + R * R);
  const zoomRange = () => mode === 'country' ? [1.12, 3.2] : [distFor(Math.min(H * .62, W * .62)), distFor(Math.min(H, W) * .2)];
  function layout(snap) {
    if (mode === 'globe') {
      if (small()) { T.dist = distFor(W * .47); T.ox = 0; T.oy = H * .5 - H * .33; }
      else { T.dist = distFor(Math.min(H * .39, W * .27)); T.ox = W * .5 - W * .655; T.oy = 0; }
    } else if (mode === 'country') {
      const p = $('#wl-panel').getBoundingClientRect();
      if (small()) { T.ox = 0; T.oy = H * .5 - Math.max(120, (H - Math.min(p.height || H * .5, H * .6)) * .48); T.dist = 1.42; }
      else { T.ox = W * .5 - (W - (p.width || W * .38)) * .5; T.oy = 0; T.dist = 1.3; }
    }
    if (snap) Object.assign(S, { dist: T.dist, ox: T.ox, oy: T.oy });
  }
  function resize() {
    W = innerWidth; H = innerHeight; const pr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false); camera.aspect = W / H; stars.material.uniforms.uPR.value = pr; layout(false); needs = true;
  }
  addEventListener('resize', resize);

  /* markers (HTML buttons projected from the globe: focusable, readable, clickable) */
  const mkWrap = $('#wl-markers'); const markers = [];
  function addMarker(kind, lat, lon, html, label, onClick, extra = '') {
    const b = document.createElement('button'); b.type = 'button'; b.className = `wl-mk wl-mk--${kind} ${extra}`; b.setAttribute('aria-label', label);
    b.innerHTML = `<span class="wl-mk__dot" aria-hidden="true"></span>${html}`; b.addEventListener('click', onClick); mkWrap.appendChild(b);
    const m = { el: b, v: ll2v(lat, lon, R * 1.003), kind }; markers.push(m); return m;
  }
  COUNTRIES.forEach(co => { if (!co.dot) return;
    if (co.active && co.act.length) addMarker('country', co.dot[0], co.dot[1], `<span class="wl-mk__lbl">${esc(co.name)}<small>${co.act.length} cities</small></span>`, `${co.name}: ${co.act.length} cities`, () => go(`#${co.id}`));
    else addMarker('soon', co.dot[0], co.dot[1], `<span class="wl-mk__lbl">${esc(co.name)} · coming soon</span>`, `${co.name}, coming soon`, e => { e.currentTarget.classList.add('is-say'); setTimeout(() => e.target.closest('.wl-mk').classList.remove('is-say'), 2200); });
  });
  ACTIVE.forEach(co => co.act.forEach(c => { const m = addMarker('city', c.center[0], c.center[1], `<span class="wl-mk__lbl">${esc(c.name)}</span>`, c.name, () => { remember(c.id); location.href = guideUrl(co.id, c.id); }); m.el.dataset.city = c.id; m.el.dataset.side = (LAND.cities[c.id] || {}).label || 'r'; m.el.tabIndex = -1; }));
  const v3 = new THREE.Vector3(), cam = new THREE.Vector3();
  function placeMarkers() {
    cam.copy(camera.position);
    for (const m of markers) {
      v3.copy(m.v).applyMatrix4(globe.matrixWorld);
      const nrm = v3.clone().normalize(), toCam = cam.clone().sub(v3).normalize(); const vis = nrm.dot(toCam) > .12;
      v3.project(camera); const x = (v3.x * .5 + .5) * W, y = (-v3.y * .5 + .5) * H;
      m.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; m.el.classList.toggle('is-back', !vis || x < -40 || y < -40 || x > W + 40 || y > H + 40);
    }
  }

  /* input: drag (inertia), wheel/pinch zoom, keys, tap on the globe near a country */
  const pts = new Map(); let pinch0 = 0, dist0 = 0, moved = 0;
  const rotK = () => 1.6 * (S.dist - R * .9) / (H * .9);
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = T.dist; }
    drag = { x: e.clientX, y: e.clientY, t: performance.now() }; vx = vy = 0; canvas.classList.add('is-drag'); lastInteract = performance.now(); });
  canvas.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) setZoom(dist0 * pinch0 / d); moved += 10; return; }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(8, now - drag.t), k = rotK();
    moved += Math.abs(dx) + Math.abs(dy);
    T.ry += dx * k; T.rx = clampX(T.rx + dy * k); S.ry = T.ry; S.rx = T.rx; vx = dx * k / dt * 16; vy = dy * k / dt * 16; drag = { x: e.clientX, y: e.clientY, t: now }; lastInteract = now; needs = true; });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; if (pts.size) return; canvas.classList.remove('is-drag');
    if (drag && moved < 6 && e.type === 'pointerup') tapAt(e.clientX, e.clientY); if (drag && performance.now() - drag.t > 80) vx = vy = 0; drag = null; lastInteract = performance.now(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const clampX = x => Math.max(-1.1, Math.min(1.25, x));
  function setZoom(d) { const [a, b] = zoomRange(); T.dist = Math.max(a, Math.min(b, d)); needs = true; }
  canvas.addEventListener('wheel', e => { e.preventDefault(); lastInteract = performance.now();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { vx -= e.deltaX * .00035; return; }
    setZoom(T.dist * Math.exp(e.deltaY * (e.deltaMode ? .05 : .0012))); }, { passive: false });
  canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Interactive globe of the cities in the guide. Arrow keys spin it, plus and minus zoom. Use the Belgium button or All destinations to choose a city.');
  $('#wl-stage').removeAttribute('aria-hidden');
  canvas.addEventListener('keydown', e => { const k = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1] }[e.key];
    if (k) { e.preventDefault(); T.ry += k[0]; T.rx = clampX(T.rx + k[1]); lastInteract = performance.now(); needs = true; }
    else if (e.key === '+' || e.key === '=') setZoom(T.dist * .88); else if (e.key === '-') setZoom(T.dist * 1.14); });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tapAt(x, y) {
    ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObject(earth)[0]; if (!hit) return;
    const p = globe.worldToLocal(hit.point.clone()).normalize();
    if (mode === 'country') { let best = null, bd = 1e9; focusCountry.act.forEach(c => { const d = p.angleTo(ll2v(c.center[0], c.center[1]).normalize()); if (d < bd) { bd = d; best = c; } });
      if (best && bd < .012) go(`#${focusCountry.id}/${best.id}`); return; }
    for (const co of ACTIVE) if (p.angleTo(ll2v(co.dot[0], co.dot[1]).normalize()) < .03 + .02 * (S.dist - 2)) { go(`#${co.id}`); return; }
  }

  /* loop */
  let needs = true, running = true, lt = performance.now(), t0 = lt;
  const ease = (a, b, k) => a + (b - a) * k;
  function frame(now) {
    if (!running) return; requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - lt) / 1000); lt = now; const k = REDUCED ? 1 : 1 - Math.exp(-dt * (mode === 'country' ? 2.4 : 3.2));
    if (!drag) {
      if (Math.abs(vx) > 1e-5 || Math.abs(vy) > 1e-5) { T.ry += vx; T.rx = clampX(T.rx + vy); S.ry = T.ry; S.rx = T.rx; const f = Math.pow(.93, dt * 60); vx *= f; vy *= f; if (Math.abs(vx) < 1e-5) vx = 0; if (Math.abs(vy) < 1e-5) vy = 0; }
      else if (mode === 'globe' && !REDUCED && now - lastInteract > 2500) { T.ry += dt * .045; S.ry = T.ry; }
    }
    for (const key of ['rx', 'ry', 'dist', 'ox', 'oy', 'focus']) S[key] = ease(S[key], T[key], k);
    globe.rotation.set(S.rx, S.ry, 0, 'XYZ');
    camera.position.set(0, 0, S.dist); camera.lookAt(0, 0, 0);
    camera.setViewOffset(W, H, S.ox, S.oy, W, H); camera.updateProjectionMatrix();
    earthMat.uniforms.uFocusAmt.value = S.focus;
    /* flare on the silhouette, top-right */
    const a = Math.acos(R / S.dist), u = new THREE.Vector3(.72, .69, 0).normalize();
    flare.position.copy(u.clone().multiplyScalar(R * Math.sin(a) * 1.012)).add(new THREE.Vector3(0, 0, R * Math.cos(a) * .98 - .04));
    const fs = .9 * (S.dist - R) * .5; flare.scale.set(fs, fs, 1); flare.material.opacity = mode === 'country' ? .35 : .95;
    stars.material.uniforms.uT.value = (now - t0) / 1000;
    renderer.render(scene, camera); placeMarkers();
  }
  resize(); layout(true);
  renderer.render(scene, camera); canvas.classList.add('is-ready'); requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { const r = !document.hidden && !document.body.classList.contains('is-show'); setRunning(r); });
  function setRunning(r) { if (r && !running) { running = true; lt = performance.now(); requestAnimationFrame(frame); } else if (!r) running = false; }

  return {
    toGlobe() { mode = 'globe'; focusCountry = null; T.focus = 0; T.rx = clampX(.42); layout(false); lastInteract = performance.now(); },
    toCountry(co) { mode = 'country'; focusCountry = co; const f = facing(co.dot[0], co.dot[1]); T.rx = f.x;
      let d = f.y - S.ry; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; T.ry = S.ry + d; vx = vy = 0;
      earthMat.uniforms.uFocus.value.copy(ll2v(co.dot[0], co.dot[1]).normalize()); T.focus = 1; layout(false); },
    relayout() { layout(false); },
    pause(p) { setRunning(!p); }
  };
}

/* ---------- city showcase ---------- */
const show = $('#wl-show');
let lastFocus = null, revealObs = null;
async function openShow(co, c) {
  const L = c.land || {}, imgs = L.images || [];
  const hero = c.images && c.images.hero;
  show.innerHTML = `
    <div class="ws-bar"><a class="logo" href="./"><img class="logo__img" src="img/brand/lockup-horizontal-white.svg" alt="Table and the City" width="170" height="36"></a>
      <button class="ws-close" type="button" data-close><svg viewBox="0 0 46 12" aria-hidden="true"><path d="M46 6H1M6 1 1 6l5 5"/></svg>${esc(co.name)}</button></div>
    <section class="ws-hero">${hero ? `<img ${heroSet(hero)}${focus(c)} alt="${esc(L.heroCaption || c.name)}" fetchpriority="high">` : ''}
      <div class="ws-hero__txt"><p class="wl-eyebrow">${esc(co.name)}</p><h2 id="wl-show-title">${esc(c.name)}</h2>
        ${L.tagline ? `<p class="ws-tag">${esc(L.tagline)}</p>` : ''}<p class="ws-cap" id="ws-hero-cap">${esc(L.heroCaption || '')}</p>
        <div class="ws-btns"><a class="ws-go" href="${guideUrl(co.id, c.id)}">Find my table in ${esc(c.name)} <span aria-hidden="true">→</span></a>
          <a class="ws-ghost" href="${guideUrl(co.id, c.id, '#explore')}">Explore restaurants</a></div></div>
      <span class="ws-scroll" aria-hidden="true">Scroll ↓</span></section>
    ${imgs.length ? `<section class="ws-body"><div class="ws-body__head"><h3>What ${esc(c.name)} <i>has to offer</i></h3></div>
      <div class="ws-grid">${imgs.map(im => { const ws = im.sizes || [900, 1600];
        return `<figure class="ws-fig"><div class="ws-ph${im.ratio && im.ratio < 1.2 ? ' ws-ph--sq' : ''}"><img src="${esc(im.src)}-${ws[0]}.webp" srcset="${ws.map(w => `${esc(im.src)}-${w}.webp ${w}w`).join(', ')}" sizes="(max-width:760px) 92vw, 50vw" alt="${esc(im.caption)}" loading="lazy" decoding="async"></div>
          <figcaption><p>${esc(im.caption)}</p>${im.credit ? `<small>Photo: ${im.source ? `<a href="${esc(im.source)}" target="_blank" rel="noopener">${esc(im.credit)}</a>` : esc(im.credit)}</small>` : ''}</figcaption></figure>`; }).join('')}</div>
      <div class="ws-end"><p>Hungry yet?</p><div class="ws-btns"><a class="ws-go" href="${guideUrl(co.id, c.id)}">Find my table in ${esc(c.name)} <span aria-hidden="true">→</span></a>
        <button class="ws-ghost" type="button" data-close>Other cities</button></div>
        <p class="ws-note">Photos show the city, not the restaurants in the guide. <a href="img/CREDITS.json" data-credits>Credits &amp; licences</a></p></div></section>` : ''}`;
  show.hidden = false; show.scrollTop = 0; document.body.classList.add('is-show');
  { const bar = show.querySelector('.ws-bar'); show.onscroll = () => bar.classList.toggle('is-solid', show.scrollTop > innerHeight * .55); }
  lastFocus = document.activeElement;
  requestAnimationFrame(() => requestAnimationFrame(() => show.classList.add('is-open')));
  setTimeout(() => { if (document.body.classList.contains('is-show') && G) G.pause(true); }, 800);
  show.querySelector('[data-close]').focus({ preventScroll: true });
  show.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeShow));
  revealObs && revealObs.disconnect();
  if ('IntersectionObserver' in window && !REDUCED) { revealObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealObs.unobserve(e.target); } }), { root: show, rootMargin: '0px 0px -8% 0px' });
    show.querySelectorAll('.ws-fig').forEach(f => revealObs.observe(f)); }
  else show.querySelectorAll('.ws-fig').forEach(f => f.classList.add('is-in'));
  document.title = `${c.name} — Table and the City`;
  if (hero) credits().then(cr => { const e = cr.find(x => x.file && x.file.startsWith(hero)); const cap = show.querySelector('#ws-hero-cap');
    if (e && cap) cap.insertAdjacentHTML('beforeend', ` <small>· Photo: ${esc(e.photographer)}${/unsplash/i.test(e.source || '') ? ' / Unsplash' : ''}</small>`); });
}
function hideShow() {
  if (show.hidden) return; show.classList.remove('is-open'); document.body.classList.remove('is-show'); G && G.pause(false);
  setTimeout(() => { if (!show.classList.contains('is-open')) { show.hidden = true; show.innerHTML = ''; } }, REDUCED ? 0 : 650);
  document.title = 'Table and the City — choose your city';
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
function closeShow() { const [co] = parse(); if (pushed > 0) { pushed--; history.back(); } else go(co ? `#${co.id}` : '', true); }

/* ---------- router ---------- */
let pushed = 0, STATE = (history.state && history.state.wl) || '';   // '#be' = Belgium's city cards; kept in history.state, never in the URL
function parse() { const [a] = STATE.replace(/^#/, '').toLowerCase().split('/'); const co = ACTIVE.find(c => c.id === a) || null; return [co, null]; }
function go(hash, replace) { hash = hash || ''; if (STATE === hash) { apply(); return; } STATE = hash;
  const u = location.pathname + location.search; if (replace) history.replaceState({ wl: hash }, '', u); else { history.pushState({ wl: hash }, '', u); pushed++; } apply(); }
addEventListener('popstate', e => { if (pushed > 0) pushed--; STATE = (e.state && e.state.wl) || ''; apply(); });
function apply() {
  const [co, c] = parse();
  if (co) { renderCardsOnce(co); document.body.classList.add('is-country'); $('#wl-panel').hidden = false; G && G.toCountry(co); }
  else { document.body.classList.remove('is-country'); G && G.toGlobe(); }
  if (c) openShow(co, c); else hideShow();
  dest.classList.remove('is-open');
}
let cardsFor = null;
function renderCardsOnce(co) { if (cardsFor === co.id) return; cardsFor = co.id; renderCards(co); requestAnimationFrame(() => G && G.relayout()); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-country]'); if (b) { e.preventDefault(); go('#' + b.dataset.country); return; }
  if (e.target.closest('[data-globe]')) { e.preventDefault(); go('', false); return; }
});
/* hovering a card lights its dot on the globe (and the other way round) */
const hot = (id, on) => document.querySelectorAll(`[data-city="${id}"]`).forEach(el => el.classList.toggle('is-hot', on));
['pointerover', 'focusin'].forEach(t => document.addEventListener(t, e => { const el = e.target.closest && e.target.closest('.wl-card,.wl-mk--city'); if (el) hot(el.dataset.city, true); }));
['pointerout', 'focusout'].forEach(t => document.addEventListener(t, e => { const el = e.target.closest && e.target.closest('.wl-card,.wl-mk--city'); if (el) hot(el.dataset.city, false); }));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dest.classList.contains('is-open')) openDest(false);
  else if (!show.hidden) closeShow();
  else if (document.body.classList.contains('is-country')) go('', false);
});
/* keep Tab inside the open showcase */
show.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const f = [...show.querySelectorAll('a[href],button')]; if (!f.length) return;
  const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } });

document.documentElement.classList.remove('wl-boot');
apply();
window.TGWorld = { ready: true, globe: !!G };
