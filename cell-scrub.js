/* ============================================================
   The cell intro - the factory cell, built by scrolling.

   The section is several screens tall and its stage is position:sticky, so
   the picture holds still while the reader scrolls through it. The scroll
   position, not a clock, decides how much of the cell stands and which of
   the four measured states it is in; scrolling back up takes it apart
   again. Scrolling stays native: nothing captures the wheel or a touch, so
   the nav links, the keyboard and the scrollbar all keep working.

   The idea (a pinned hero whose picture advances with the scroll, a title
   that blurs away, a closing line, a thin progress rule) follows the
   "Scroll Locked Video Hero" by Guglielmo Giannattasio on 21st.dev. The
   picture here is the model from factory-cell-scene.js instead of a video.
   ============================================================ */
import * as THREE from './vendor/three.bundle.min.js?v=1';
import { MACHINES, ORDER, STEPS, lerp, clamp01, smooth, rateAt, createCell, frameCell } from './factory-cell-scene.js';

const deg = Math.PI / 180;

/* The storyboard, in fractions of the scroll through the section. */
const TITLE_OUT = [0, 0.14];       // the title blurs away
const BUILD     = [0.04, 0.46];    // components rise from the plate
const PLAN_OUT  = [0.10, 0.40];    // the footprints drawn on the deck fade as they fill
const CHANGES   = [0.56, 0.90];    // the three changes, one after another
const CHANGE_RAMP = 0.6;           // share of each change spent moving; the rest holds
const TAG_IN    = [0.88, 0.96];    // the closing line
const BAR_OUT   = [0.93, 1];       // the progress rule fades, so it is gone when the section scrolls away
const BAR_OPACITY = 0.85;
const span = (p, [a, b]) => clamp01((p - a) / (b - a));

/* The camera opens from the report's plan view, close in, to a
   three-quarter view, then keeps drifting round. Angles in degrees. A wide
   window looks across the cell from the operators' side; an upright one (a
   phone) turns the plan a quarter and looks down the line from the shelf
   end, so the long plate runs up the screen instead of shrinking to fit
   across it. Both are rotations of the true layout, never a mirror of it. */
const PLAN_EL = 89.3;              // not quite 90, so "up" stays defined
const PATH_WIDE = { planAz: 0,   isoAz: -22, isoEl: 24, driftAz: -12, driftEl: -3 };
const PATH_TALL = { planAz: -90, isoAz: -72, isoEl: 40, driftAz: 12,  driftEl: -3 };
const ZOOM_START = 0.62;           // how close the plan view starts, against a full fit
const LIGHTS_LOW = 0.3;            // how dim the studio is before the build starts

const PIXEL_BUDGET = 3.2e6;        // drawn pixels per frame, before a dense screen is drawn at less than its full density
const WARMUP_S = 45;               // simulated seconds for the line to settle before it is shown
const FOLLOW = 10;                 // how quickly the picture catches up with the scroll, per second

// The component the build has reached, for the status line. Each one starts
// to rise as build * (ORDER.length + 2) passes its place in the order;
// station 2 has a place too but only arrives with the second change.
function risingName(build){
  let i = Math.min(ORDER.length - 1, Math.floor(build * (ORDER.length + 2)));
  while (MACHINES[ORDER[i]] && MACHINES[ORDER[i]].added) i--;
  return MACHINES[ORDER[i]] ? MACHINES[ORDER[i]].label : 'Safety fence';
}

/* ---------- the studio ----------
   What the cell stands in: a floor with a faint drafting grid that fades out
   to nothing well before its edge, so it dissolves into the page behind the
   canvas, and a pool of warm light around the plate. Its colours come from
   the section's CSS, so it follows the site theme. */
const FLOOR_Y = -0.69;             // just under the plate's feet
const FLOOR_M = 120;               // metres across
const TILE_M = 4;                  // one grid tile: a firm line every 4 m, fine ones every metre
const TILE_PX = 256;
const POOL_M = [38, 30];           // the pool of light, a little larger than the plate

function canvasTexture(size, draw){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (draw) draw(ctx, size);
  return { ctx, texture: new THREE.CanvasTexture(c) };
}
// white in the middle, gone at the edge
function falloff(stops){
  return canvasTexture(256, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  }).texture;
}
function buildStudio(scene, renderer, section){
  const tile = canvasTexture(TILE_PX);
  tile.texture.colorSpace = THREE.SRGBColorSpace;
  tile.texture.wrapS = tile.texture.wrapT = THREE.RepeatWrapping;
  tile.texture.repeat.set(FLOOR_M / TILE_M, FLOOR_M / TILE_M);
  tile.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // The floor is opaque black where the alpha map is black, so that map is
  // drawn as grey levels: full under the plate, nothing from 25 m out.
  const fade = canvasTexture(256, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [at, v] of [[0, 255], [0.12, 255], [0.2, 170], [0.3, 70], [0.42, 0], [1, 0]]) g.addColorStop(at, `rgb(${v},${v},${v})`);
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  }).texture;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_M, FLOOR_M),
    new THREE.MeshStandardMaterial({ map: tile.texture, alphaMap: fade, transparent: true, depthWrite: false, roughness: 0.62, metalness: 0.12 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  floor.renderOrder = -3;
  scene.add(floor);

  const poolMat = new THREE.MeshBasicMaterial({ map: falloff([[0, 1], [0.35, 0.55], [0.7, 0.12], [1, 0]]), transparent: true, depthWrite: false, toneMapped: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(POOL_M[0], POOL_M[1]), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = FLOOR_Y;
  pool.renderOrder = -2;
  scene.add(pool);

  let poolFull = 0;
  return {
    // repaint from the section's colours; call again when the theme changes
    applyTheme(){
      const css = getComputedStyle(section);
      const token = name => css.getPropertyValue(name).trim();
      const c = tile.ctx, n = TILE_PX, step = n / TILE_M;
      c.globalAlpha = 1;
      c.fillStyle = token('--scrub-floor');
      c.fillRect(0, 0, n, n);
      c.fillStyle = token('--scrub-line');
      for (let i = 0; i < TILE_M; i++){
        const firm = i === TILE_M / 2;
        c.globalAlpha = firm ? 1 : 0.5;
        c.fillRect(i * step, 0, firm ? 2 : 1, n);
        c.fillRect(0, i * step, n, firm ? 2 : 1);
      }
      tile.texture.needsUpdate = true;
      poolMat.color.set(token('--scrub-pool'));
      poolFull = parseFloat(token('--scrub-pool-a')) || 0;
    },
    // 0 to 1: how far the lights are up
    setLight(k){ poolMat.opacity = poolFull * k; }
  };
}

let instance = null;

export function mount(){
  if (instance) return instance;
  const section = document.getElementById('cell-intro');
  const pin   = section.querySelector('.scrub-pin');
  const stage = section.querySelector('.scrub-stage');
  const dock  = section.querySelector('.scrub-dock');
  const title = section.querySelector('.scrub-title h2');
  const eyebrow = section.querySelector('.scrub-eyebrow');
  const hint  = section.querySelector('.scrub-hint');
  const glow  = section.querySelector('.scrub-glow');
  const tag   = section.querySelector('.scrub-tag');
  const hud   = section.querySelector('.scrub-hud');
  const rateEl  = hud.querySelector('.val');
  const deltaEl = hud.querySelector('.delta');
  const modeEl  = section.querySelector('.scrub-mode');
  const note  = section.querySelector('.scrub-note');
  const bar   = section.querySelector('.scrub-prog i');

  // Reduced motion: one screen, the finished cell, drawn once.
  const still = section.classList.contains('is-still');
  // A phone or tablet gets the lighter picture: smaller shadows, fewer
  // pixels, no blur on the type.
  const light = matchMedia('(max-width: 720px), (pointer: coarse)').matches;

  // Throws where WebGL is unavailable; index.html then falls back to the
  // plain band.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  stage.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  let model;
  try {
    model = createCell(renderer, { reduce: still, shadowSize: light ? 1024 : 2048 });
  } catch (err) {
    // give the context back before index.html falls back to the plain band
    renderer.dispose();
    renderer.domElement.remove();
    throw err;
  }
  const { scene, sim, corners } = model;
  const studio = buildStudio(scene, renderer, section);
  studio.applyTheme();
  // Let the line run before anyone sees it, so the baseline's queue is
  // already standing at the manual station when the line first appears. The
  // still picture only ever shows the last state, so it settles into that.
  sim.stepF = still ? STEPS.length - 1 : 0;
  for (let t = 0; t < WARMUP_S; t += 0.1) model.advance(0.1);

  /* ---------- camera ---------- */
  const target = new THREE.Vector3(0, 0.7, 0);
  const dir = new THREE.Vector3();
  const v = new THREE.Vector3();
  let W = 1, H = 1, insetTop = 0, insetBottom = 0, travel = 0, noteHalf = 0;

  function frameCamera(p){
    const path = W < H ? PATH_TALL : PATH_WIDE;
    const open = smooth(span(p, [0, BUILD[1]]));
    const drift = span(p, [BUILD[1], 1]);
    const el = (lerp(PLAN_EL, path.isoEl, open) + path.driftEl * drift) * deg;
    const az = (lerp(path.planAz, path.isoAz, open) + path.driftAz * drift) * deg;
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const fit = frameCell(camera, corners, target, dir, W, H, insetTop, insetBottom);
    camera.position.copy(target).addScaledVector(dir, fit.d * lerp(ZOOM_START, 1, open));
    camera.lookAt(target);
    camera.setViewOffset(W, H, 0, fit.off, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /* ---------- what the scroll position means ---------- */
  function stepAt(p){
    const s = span(p, CHANGES) * (STEPS.length - 1);
    const i = Math.min(STEPS.length - 2, Math.floor(s));
    return i + smooth((s - i) / CHANGE_RAMP);
  }
  function setText(el, text){
    if (el.textContent !== text) el.textContent = text;
  }
  function fade(el, t, risePx, blurPx){
    el.style.opacity = t.toFixed(3);
    el.style.transform = `translateY(${((1 - t) * risePx).toFixed(1)}px)`;
    if (!light) el.style.filter = t < 0.999 ? `blur(${((1 - t) * blurPx).toFixed(1)}px)` : 'none';
  }
  function paintOverlays(p){
    const live = sim.build > 0.95;
    const n = Math.round(sim.stepF);

    if (!still) fade(title, 1 - span(p, TITLE_OUT), -24, 10);
    hint.classList.toggle('gone', p > 0.004);
    const t = span(p, TAG_IN);
    fade(tag, t, 20, 8);
    tag.classList.toggle('in', t > 0.02);      // its link can be reached only once it shows

    hud.classList.toggle('on', live);
    hud.classList.toggle('opt', sim.stepF > STEPS.length - 1.02);
    setText(rateEl, String(Math.round(rateAt(sim.stepF))));
    setText(deltaEl, n === 0 ? 'Baseline' : '+' + Math.round((STEPS[n].rate / STEPS[0].rate - 1) * 100) + '% vs baseline');
    if (live) setText(modeEl, STEPS[n].name);
    else if (sim.build > 0) setText(modeEl, 'Building · ' + risingName(sim.build));
    else setText(modeEl, '');

    // the constraint call-out, baseline only
    const na = live ? clamp01((1.2 - sim.stepF) / 1.2) : 0;
    note.style.opacity = na.toFixed(3);
    if (na > 0){
      v.copy(model.constraintAnchor).project(camera);
      const x = Math.max(noteHalf + 8, Math.min(W - noteHalf - 8, (v.x * 0.5 + 0.5) * W));
      const y = Math.min(H - insetBottom - 12, (-v.y * 0.5 + 0.5) * H + 10);
      note.style.transform = `translate(${Math.round(x - noteHalf)}px,${Math.round(y)}px)`;
    }

    bar.style.transform = `scaleX(${p.toFixed(4)})`;
    bar.style.opacity = (BAR_OPACITY * (1 - span(p, BAR_OUT))).toFixed(3);
  }

  function draw(p, dt){
    sim.build = span(p, BUILD);
    sim.plan = 1 - smooth(span(p, PLAN_OUT));
    sim.stepF = stepAt(p);
    model.advance(dt);
    model.apply();
    // the studio lights come up as the cell does
    const lit = still ? 1 : lerp(LIGHTS_LOW, 1, smooth(span(p, [0, BUILD[1]])));
    studio.setLight(lit);
    glow.style.opacity = lit.toFixed(3);
    frameCamera(p);
    paintOverlays(p);
    renderer.render(scene, camera);
  }

  /* ---------- loop: runs only while the section is on screen ---------- */
  let shown = -1, held = null, last = 0, inView = false, running = false, lost = false;
  function progress(){
    if (still) return 1;
    if (held !== null) return held;
    return travel > 0 ? clamp01(-section.getBoundingClientRect().top / travel) : 0;
  }
  function frame(now){
    if (!inView || lost){ running = false; return; }
    const dt = Math.max(0, Math.min(64, now - last)) / 1000;
    last = now;
    const goal = progress();
    shown = shown < 0 ? goal : shown + (goal - shown) * (1 - Math.exp(-dt * FOLLOW));
    if (Math.abs(goal - shown) < 0.0004) shown = goal;
    draw(shown, dt);
    requestAnimationFrame(frame);
  }
  function start(){
    if (running || still || lost) return;
    running = true;
    shown = -1;                    // coming back into view: jump to where the page is, do not replay
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function drawOnce(){
    if (lost) return;
    shown = progress();
    draw(shown, 0);
  }

  function resize(){
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, light ? 1.5 : 2, Math.sqrt(PIXEL_BUDGET / (W * H)));
    renderer.setPixelRatio(Math.max(1, dpr));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Keep the model clear of the type: under the bar and the eyebrow (and,
    // where the title stays put, under the title), above the dock.
    const pinTop = pin.getBoundingClientRect().top;
    const above = still ? title : eyebrow;
    insetTop = Math.round(above.getBoundingClientRect().bottom - pinTop) + 14;
    insetBottom = H - Math.round(dock.getBoundingClientRect().top - pinTop) + 14;
    travel = section.offsetHeight - pin.offsetHeight;
    noteHalf = note.offsetWidth / 2;
    if (!running) drawOnce();
  }

  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (still) drawOnce(); else if (inView) start();
  });

  // the floor is painted in the theme's colours, so repaint it when that changes
  new MutationObserver(() => {
    studio.applyTheme();
    if (!running) drawOnce();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.compile(scene, camera);
  drawOnce();
  section.classList.add('has-cell');

  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) start();
  }).observe(section);

  // For checks and screenshots: hold the picture at a scroll fraction
  // whatever the page is doing, or pass null to follow the page again.
  instance = {
    hold(p){ held = p; shown = -1; if (!running) drawOnce(); }
  };
  return instance;
}
