/* ============================================================
   The cohort tear - Case 02's opening, torn open by scrolling.

   The page shows a proposed rule in poster type: LATE = FAIL. Scroll, and a
   crack runs out from the middle of the words, the page tears in two along
   it and the halves pull apart. Behind them stand the 79 candidates of the
   SkillMap cohort; those who did not complete step back and the 45
   graduates remain. The rule is then applied, striking the graduates out
   one after another in strict order, because every one of them submitted
   late; and then manual review clears the marks again. Scrolling back up
   undoes it.

   Nothing covers the page except the gap itself: the words are two clipped
   copies of the same heading that move apart, and one canvas draws what is
   behind the paper (clipped to the gap), the torn edges and the crack. The
   section is pinned with position:sticky and scrolling stays native, like
   the cell intro (cell-scrub.js), whose page furniture it shares.

   The idea (a sheet that cracks, tears and parts as you scroll, with
   something rising into the gap) follows the "Tiger Tear Reveal" by
   kedhareswer on 21st.dev. The people are the hero's: Open Peeps by Pablo
   Stanley (CC0), credited in the page footer.
   ============================================================ */

const SHEET = { src: 'assets/crowd.webp', cols: 15, rows: 7, cellW: 240, cellH: 324 };
const CANDIDATES = 79;             // everyone enrolled in the cohort
const GRADUATES = 45;              // those who completed the programme

/* The storyboard, in fractions of the scroll through the section. */
const CRACK   = [0.04, 0.14];      // a crack runs out from the middle of the words
const OPEN    = [0.12, 0.34];      // the page tears and the halves pull apart
const JOLT    = [0.115, 0.15, 0.17, 0.24];   // the shake of the rip: in, then out
const RISE    = [0.20, 0.42];      // the whole cohort comes up from behind
const SORT    = [0.44, 0.52];      // those who did not complete step back; the graduates stay
const RULE    = [0.56, 0.73];      // the rule is applied to the graduates: struck out, one by one
const REVIEW  = [0.80, 0.92];      // manual review clears the marks
const TAG_IN  = [0.90, 0.97];      // the closing line
const BAR_OUT = [0.93, 1];         // the progress rule fades, so it is gone when the section scrolls away
const BAR_OPACITY = 0.85;

const TEAR_ANGLE = -7;             // degrees: the tear rises slightly to the right
const STEP_PX = 9;                 // one tear-line point every 9 px
const FOLLOW = 10;                 // how quickly the picture catches up with the scroll, per second
const DIMMED = 0.34;               // how faint a struck-out graduate is drawn
const STOOD_BACK = 0.2;            // how faint someone who did not complete is drawn

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const span = (p, [a, b]) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

/* Seeded random numbers (mulberry32), so the tear and the crowd are the same
   on every visit and every resize. */
function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(n, seed){
  const r = rng(seed), out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* The tear, left to right across more than the whole stage: a slight rising
   diagonal, a slow wander, fine fibres and the odd big tooth. `k` scales the
   roughness with the stage, so a phone's tear is not coarser than a desk's. */
function tearLine(W, cx, cy, k){
  const r = rng(11), slope = Math.tan(TEAR_ANGLE * Math.PI / 180), out = [];
  for (let x = -0.3 * W; x <= 1.3 * W; x += STEP_PX){
    const fibre = (r() - 0.5) * 5 * k;
    const tooth = r() < 0.09 ? (r() - 0.5) * 26 * k : 0;
    const wander = (Math.sin(x * 0.019 / k + 11) * 10 + Math.sin(x * 0.053 / k + 22) * 4) * k;
    out.push([x, cy + (x - cx) * slope + wander + fibre + tooth]);
  }
  return out;
}

// Where the paper curls back over the gap: [share of the width, half-width, depth], in stage widths.
const CURLS = {
  top:    [[0.27, 0.036, 0.026], [0.56, 0.026, 0.018], [0.80, 0.042, 0.030]],
  bottom: [[0.18, 0.040, 0.028], [0.46, 0.028, 0.019], [0.70, 0.034, 0.024]]
};

let instance = null;

export function mount(){
  if (instance) return instance;
  const section = document.getElementById('cohort-tear');
  const pin    = section.querySelector('.scrub-pin');
  const cv     = section.querySelector('.tear-cv');
  const sheet  = section.querySelector('.tear-sheet');
  const word   = sheet.querySelector('.tear-word');
  const hint   = section.querySelector('.scrub-hint');
  const tag    = section.querySelector('.scrub-tag');
  const hud    = section.querySelector('.scrub-hud');
  const valEl  = hud.querySelector('.val');
  const unitEl = hud.querySelector('.unit');
  const deltaEl = hud.querySelector('.delta');
  const modeEl = section.querySelector('.scrub-mode');
  const bar    = section.querySelector('.scrub-prog i');
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas');

  // Reduced motion: one screen, the end of the story, drawn once.
  const still = section.classList.contains('is-still');
  const light = matchMedia('(max-width: 720px), (pointer: coarse)').matches;

  /* The words tear with the page: two copies of the heading, one clipped to
     each side of the tear, stand in for it from the first crack on. */
  const halves = ['top', 'bottom'].map(side => {
    const el = document.createElement('div');
    el.className = 'tear-half';
    el.setAttribute('aria-hidden', 'true');
    const copy = sheet.cloneNode(true);
    copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    el.appendChild(copy);
    pin.insertBefore(el, sheet.nextSibling);
    return { side, el };
  });

  const people = new Image();
  let peopleReady = false;

  /* ---------- geometry, rebuilt on resize ---------- */
  let W = 1, H = 1, DPR = 1, cx = 0, cy = 0, k = 1, travel = 0;
  let line = [], widths = { top: [], bottom: [] }, crowd = [];
  let lift = 0, drop = 0;
  let paint = { behind: '#f5f3ee', fibre: '#fff', fail: '#d2573f', ink: '#191b1e' };

  // where each half is at a given opening: [dx, dy, rotation in radians]
  function motion(side, open){
    return side === 'top'
      ? [-0.010 * W * open, -lift * open, -2.6 * Math.PI / 180 * open]
      : [ 0.012 * W * open,  drop * open,  2.1 * Math.PI / 180 * open];
  }
  function moved(points, [dx, dy, rot]){
    const c = Math.cos(rot), s = Math.sin(rot);
    return points.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy]);
  }
  // the bottom half's edge when fully open, without its teeth: what the graduates stand behind
  function sill(x){
    const [dx, dy, rot] = motion('bottom', 1);
    return cy + dy + (x - cx - dx) * Math.tan(TEAR_ANGLE * Math.PI / 180 + rot);
  }

  // the top half's edge when fully open: what the back row must stay under
  function lintel(x){
    const [dx, dy, rot] = motion('top', 1);
    return cy + dy + (x - cx - dx) * Math.tan(TEAR_ANGLE * Math.PI / 180 + rot);
  }

  function layout(){
    const r = pin.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, light ? 1.5 : 2);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    k = Math.max(0.55, Math.min(1.3, W / 1100));
    travel = section.offsetHeight - pin.offsetHeight;

    // the tear runs through the middle of the words
    const wr = word.getBoundingClientRect();
    cx = W / 2;
    cy = wr.top - r.top + wr.height / 2;
    const upright = W < H;
    lift = H * (upright ? 0.15 : 0.19);
    drop = H * (upright ? 0.15 : 0.19);

    line = tearLine(W, cx, cy, k);
    for (const [side, seed] of [['top', 5], ['bottom', 8]]){
      const rand = rng(seed);
      widths[side] = line.map((_, i) => (2.5 + 6 * (0.5 + 0.5 * Math.sin(i * 0.37 + seed)) * (0.6 + rand() * 0.8)) * k);
    }

    // each half is the heading clipped to its side of the tear
    const far = 2 * Math.max(W, H);
    const pts = line.map(([x, y]) => x.toFixed(1) + 'px ' + y.toFixed(1) + 'px');
    const x0 = line[0][0].toFixed(1) + 'px', x1 = line[line.length - 1][0].toFixed(1) + 'px';
    halves[0].el.style.clipPath = `polygon(${x0} ${-far}px,${x1} ${-far}px,${pts.slice().reverse().join(',')})`;
    halves[1].el.style.clipPath = `polygon(${pts.join(',')},${x1} ${far}px,${x0} ${far}px)`;
    for (const h of halves) h.el.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;

    layoutCrowd();
  }

  /* The cohort in rows, the back rows higher. Their cut-off bottoms sit below
     the sill, behind the paper. */
  function layoutCrowd(){
    const cols = W >= 1100 ? 20 : 11, rows = Math.ceil(CANDIDATES / cols);
    const gap = lift + drop;
    const slot = W * 0.92 / cols;
    const pw = Math.min(slot * 1.62, gap * 0.9 * SHEET.cellW / SHEET.cellH);
    const ph = pw * SHEET.cellH / SHEET.cellW;
    const showing = ph * 0.62;                       // how much of the front row clears the sill
    const rowStep = rows > 1 ? Math.min(ph * 0.42, (gap - showing - 10 * k) / (rows - 1)) : 0;
    const cells = shuffled(SHEET.cols * SHEET.rows, 31);
    const rand = rng(47);
    crowd = [];
    for (let i = 0; i < CANDIDATES; i++){
      const row = Math.floor(i / cols), col = i % cols;             // row 0 is the back
      const inRow = row === rows - 1 ? CANDIDATES - cols * (rows - 1) : cols;
      const x = W / 2 + (col - (inRow - 1) / 2) * slot + (rand() - 0.5) * slot * 0.34 + (row % 2 ? slot * 0.22 : -slot * 0.22);
      crowd.push({
        cell: cells[i], x: x - pw / 2, pw, ph,
        top: Math.max(lintel(x) + 8 * k, sill(x) - showing - (rows - 1 - row) * rowStep + (rand() - 0.5) * ph * 0.06),
        flip: rand() > 0.5,
        delay: rand() * 0.55 + (rows - 1 - row) * 0.04,             // when it starts to rise
        graduate: false
      });
    }
    // Which 45 completed is not on the page, so they are simply spread through the crowd.
    shuffled(CANDIDATES, 59).slice(0, GRADUATES).forEach(who => { crowd[who].graduate = true; });
    const graduates = crowd.filter(person => person.graduate);
    // The rule works through the graduates in strict reading order. Review
    // does not: it reaches them in no particular order.
    graduates.forEach((person, rank) => { person.ruleRank = rank; });
    shuffled(GRADUATES, 73).forEach((who, rank) => { graduates[who].reviewRank = rank; });
  }

  function readTheme(){
    const css = getComputedStyle(section);
    const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    paint = {
      behind: token('--tear-behind', paint.behind),
      fibre: token('--tear-fibre', paint.fibre),
      fail: token('--tear-fail', paint.fail),
      ink: token('--scrub-ink', paint.ink)
    };
  }

  /* ---------- what the scroll position means ---------- */
  // how far through its turn (0 to 1) item `rank` of `n` is, when the whole run is at `t`
  const turn = (t, rank, n) => clamp01(t * (n + 1.5) - rank);

  function stateAt(p){
    const open = smooth(span(p, OPEN));
    const rise = span(p, RISE), rule = span(p, RULE), review = span(p, REVIEW);
    const away = smooth(span(p, SORT));              // how far the non-graduates have stepped back
    let shown = 0, failed = 0, cleared = 0;
    const each = crowd.map(person => {
      const up = smooth((rise - person.delay * 0.6) / 0.42);
      const struck = person.graduate ? turn(rule, person.ruleRank, GRADUATES) : 0;
      const freed = person.graduate ? turn(review, person.reviewRank, GRADUATES) : 0;
      if (up > 0.5) shown++;
      if (struck > 0.5) failed++;
      if (freed > 0.5) cleared++;
      return { up, struck, freed, away: person.graduate ? 0 : away };
    });
    return {
      p, open, each, shown, failed, cleared,
      crack: smooth(span(p, CRACK)),
      jolt: smooth(span(p, [JOLT[0], JOLT[1]])) * (1 - smooth(span(p, [JOLT[2], JOLT[3]]))),
      phase: p < (SORT[0] + SORT[1]) / 2 ? 'cohort' : p < RULE[0] ? 'graduates' : p < REVIEW[0] ? 'rule' : 'review'
    };
  }

  /* ---------- drawing ---------- */
  function trace(points){
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  }
  function drawPerson(person, s){
    const y = person.top + (1 - s.up) * (person.ph + 30 * k) + s.away * person.ph * 0.12;
    const out = s.struck * (1 - s.freed);            // how struck-out it looks right now
    ctx.globalAlpha = lerp(1, DIMMED, out) * lerp(1, STOOD_BACK, s.away);
    const sx = (person.cell % SHEET.cols) * SHEET.cellW, sy = Math.floor(person.cell / SHEET.cols) * SHEET.cellH;
    if (person.flip){
      ctx.save();
      ctx.translate(person.x + person.pw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(people, sx, sy, SHEET.cellW, SHEET.cellH, 0, 0, person.pw, person.ph);
      ctx.restore();
    } else {
      ctx.drawImage(people, sx, sy, SHEET.cellW, SHEET.cellH, person.x, y, person.pw, person.ph);
    }
    ctx.globalAlpha = 1;
    if (out <= 0.01) return;
    // the mark: two strokes, drawn one after the other
    const mx = person.x + person.pw / 2, my = y + person.ph * 0.40, h = person.pw * 0.25;
    ctx.globalAlpha = 1 - s.freed;
    ctx.strokeStyle = paint.fail;
    ctx.lineWidth = Math.max(2.5, person.pw * 0.06);
    ctx.lineCap = 'round';
    const a = clamp01(s.struck * 2), b = clamp01(s.struck * 2 - 1);
    ctx.beginPath();
    ctx.moveTo(mx - h, my - h); ctx.lineTo(mx - h + 2 * h * a, my - h + 2 * h * a);
    if (b > 0){ ctx.moveTo(mx + h, my - h); ctx.lineTo(mx + h - 2 * h * b, my - h + 2 * h * b); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawEdge(side, edge, open){
    const up = side === 'top', grow = Math.min(1, open * 4), w = widths[side];
    // the white paper core exposed along the tear, on this half's side of it
    ctx.beginPath();
    trace(edge);
    for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i][0], edge[i][1] + (up ? -1 : 1) * w[i] * grow);
    ctx.closePath();
    ctx.fillStyle = paint.fibre;
    ctx.fill();
    // where it curls back over the gap
    const fold = Math.min(1, open * 2.5);
    for (const [at, half, depth] of CURLS[side]){
      const mid = at * W, hw = half * W;
      const run = edge.filter(([x]) => Math.abs(x - mid) <= hw);
      if (run.length < 3) continue;
      ctx.beginPath();
      trace(run);
      for (let i = run.length - 1; i >= 0; i--){
        const lobe = Math.cos((run[i][0] - mid) / hw * Math.PI / 2);
        ctx.lineTo(run[i][0] + (up ? 6 : -6) * lobe * open * k, run[i][1] + (up ? 1 : -1) * depth * W * lobe * lobe * fold);
      }
      ctx.closePath();
      const y0 = run[0][1], shade = ctx.createLinearGradient(0, y0, 0, y0 + (up ? 1 : -1) * depth * W);
      shade.addColorStop(0, '#ffffff');
      shade.addColorStop(1, '#d9d4cb');
      ctx.fillStyle = shade;
      ctx.fill();
    }
  }

  function draw(p){
    const s = stateAt(p);
    const shake = still ? 0 : Math.sin(p * 900) * 6 * k * s.jolt;
    const torn = s.open > 0;

    // the words: whole until the page parts, then the two halves
    section.classList.toggle('is-torn', torn);
    halves.forEach(h => {
      const [dx, dy, rot] = motion(h.side, s.open);
      h.el.style.transform = `translate(${(dx + shake).toFixed(2)}px,${(dy + shake * 0.4).toFixed(2)}px) rotate(${rot.toFixed(5)}rad)`;
    });

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(shake, shake * 0.4);

    if (s.open > 0){
      const top = moved(line, motion('top', s.open)), bottom = moved(line, motion('bottom', s.open));
      // behind the paper: only ever seen through the gap
      ctx.save();
      ctx.beginPath();
      trace(top);
      for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = paint.behind;
      ctx.fillRect(-W, -H, 3 * W, 3 * H);
      if (peopleReady) crowd.forEach((person, i) => { if (s.each[i].up > 0) drawPerson(person, s.each[i]); });
      // the paper's shadow on what is behind it: deep under the top edge, slight above the bottom one
      const depth = Math.min(1, s.open * 3);
      for (const [edge, offset, strength] of [[top, 9, 0.5], [bottom, -4, 0.28]]){
        ctx.beginPath();
        trace(edge);
        ctx.shadowColor = `rgba(0,0,0,${(strength * depth).toFixed(3)})`;
        ctx.shadowBlur = 22 * k * DPR;
        ctx.shadowOffsetY = offset * k * DPR;
        ctx.strokeStyle = `rgba(0,0,0,${(0.2 * depth).toFixed(3)})`;
        ctx.lineWidth = 8 * k;
        ctx.stroke();
      }
      ctx.restore();
      drawEdge('top', top, s.open);
      drawEdge('bottom', bottom, s.open);
    }

    // the crack, running out from the middle before the page gives way
    if (s.crack > 0 && s.open < 0.15){
      const reach = s.crack * 0.62 * W;
      const run = line.filter(([x]) => Math.abs(x - cx) <= reach);
      if (run.length > 1){
        ctx.beginPath();
        trace(run);
        ctx.globalAlpha = 1 - s.open / 0.15;
        ctx.strokeStyle = paint.ink;
        ctx.lineWidth = 2.2 * k;
        ctx.lineJoin = 'bevel';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    paintOverlays(s);
  }

  function setText(el, text){
    if (el.textContent !== text) el.textContent = text;
  }
  function fade(el, t, risePx, blurPx){
    el.style.opacity = t.toFixed(3);
    el.style.transform = `translateY(${((1 - t) * risePx).toFixed(1)}px)`;
    if (!light) el.style.filter = t < 0.999 ? `blur(${((1 - t) * blurPx).toFixed(1)}px)` : 'none';
  }
  function paintOverlays(s){
    hint.classList.toggle('gone', s.p > 0.004);
    const t = span(s.p, TAG_IN);
    fade(tag, t, 20, 8);
    tag.classList.toggle('in', t > 0.02);      // its link can be reached only once it shows

    hud.classList.toggle('on', s.shown > 0);
    hud.classList.toggle('bad', s.phase === 'rule');
    hud.classList.toggle('opt', s.phase === 'review');
    if (s.phase === 'cohort'){
      setText(valEl, String(s.shown));
      setText(unitEl, 'Candidates');
      setText(deltaEl, '');
    } else if (s.phase === 'graduates'){
      setText(valEl, String(GRADUATES));
      setText(unitEl, 'Completed the programme');
      setText(deltaEl, '0 on time · ' + GRADUATES + ' late');
    } else if (s.phase === 'rule'){
      setText(valEl, String(s.failed));
      setText(unitEl, 'Failed by the rule');
      setText(deltaEl, 'of ' + GRADUATES + ' graduates');
    } else {
      setText(valEl, String(s.cleared));
      setText(unitEl, 'Passed');
      setText(deltaEl, 'By manual review');
    }
    // the sheet itself says "Proposed rule" until it is torn
    setText(modeEl, s.open < 0.5 ? ''
      : s.phase === 'cohort' ? 'The cohort'
      : s.phase === 'graduates' ? 'Who completed'
      : s.phase === 'rule' ? 'The rule, applied'
      : 'Manual review instead');

    bar.style.transform = `scaleX(${s.p.toFixed(4)})`;
    bar.style.opacity = (BAR_OPACITY * (1 - span(s.p, BAR_OUT))).toFixed(3);
  }

  /* ---------- loop: runs only while the section is on screen, and only
     draws when the scroll position has moved ---------- */
  let shown = -1, drawn = -1, held = null, last = 0, inView = false, running = false;
  function progress(){
    if (still) return 1;
    if (held !== null) return held;
    return travel > 0 ? clamp01(-section.getBoundingClientRect().top / travel) : 0;
  }
  function frame(now){
    if (!inView){ running = false; return; }
    const dt = Math.max(0, Math.min(64, now - last)) / 1000;
    last = now;
    const goal = progress();
    shown = shown < 0 ? goal : shown + (goal - shown) * (1 - Math.exp(-dt * FOLLOW));
    if (Math.abs(goal - shown) < 0.0004) shown = goal;
    requestAnimationFrame(frame);
    if (shown !== drawn){ drawn = shown; draw(shown); }
  }
  function start(){
    if (running || still) return;
    running = true;
    shown = -1;                    // coming back into view: jump to where the page is, do not replay
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function drawOnce(){
    shown = drawn = progress();
    draw(shown);
  }

  people.onload = () => { peopleReady = true; drawOnce(); };
  // Without the drawings the story has nobody in it: drop back to the plain lines.
  people.onerror = () => {
    section.classList.remove('is-3d', 'is-live', 'is-still', 'is-torn');
    window.dispatchEvent(new Event('resize'));
  };
  people.src = SHEET.src;

  new MutationObserver(() => { readTheme(); drawOnce(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The type is sized in viewport units, so it only moves when the stage does.
  new ResizeObserver(() => { layout(); drawOnce(); }).observe(pin);
  readTheme();
  layout();
  drawOnce();
  section.classList.add('has-tear');

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
