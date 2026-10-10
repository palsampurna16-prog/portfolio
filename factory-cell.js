/* ============================================================
   Fig. 2.3 - the ISAN3110 factory cell as a solid 3D model.

   Loaded on demand by index.html when the figure nears the viewport.
   Everything is procedural three.js: no model files, no images.

   Plan coordinates (x = left/right, z = front/back) and component sizes are
   traced from Fig. 23, Fig. 32 and Fig. 37 of the ISAN3110 final report, the
   same numbers the earlier line drawing used. 40 plan units = 1 metre.

   The lighting, material and base-plate approach follows the MIT-licensed
   "Agentic Factory" component by Evgeny Shilov (21st.dev); the cell itself
   is modelled from the report.
   ============================================================ */
// The ?v= number is the bundle's version: bump it whenever the bundle is
// rebuilt, because vercel.json lets browsers cache /vendor for a year.
import * as THREE from './vendor/three.bundle.min.js?v=1';

const { OrbitControls, RoundedBoxGeometry, RoomEnvironment } = THREE;

/* ---------- the real cell, from the report ---------- */
const MACHINES = {
  shelf:   { x:-248, z:-92, w:46,  h:92,  d:118, label:'Warehouse shelf' },
  convIn:  { x:-24,  z:-30, w:250, h:20,  d:24,  label:'Infeed' },
  convOut: { x:-24,  z: 26, w:250, h:20,  d:24,  label:'Outfeed' },
  mill:    { x: 192, z:-88, w:88,  h:104, d:80,  label:'Vertical mill' },
  robot:   { x: 176, z: 6,  w:46,  h:82,  d:52,  label:'Robot' },
  cmm:     { x: 206, z: 92, w:78,  h:86,  d:74,  label:'CMM' },
  ws1:     { x:-124, z:132, w:86,  h:38,  d:54,  label:'Station 1', hot:true },
  ws2:     { x:-124, z:206, w:86,  h:38,  d:54,  label:'Station 2', added:true },
  sink:    { x:-272, z:186, w:40,  h:16,  d:40,  label:'Sink' }
};
const ORDER = ['shelf', 'convIn', 'convOut', 'mill', 'robot', 'cmm', 'fence', 'ws1', 'ws2', 'sink'];

/* safety fence around the robot cell (Fig. 37) */
const FENCE = { x0:96, x1:288, z0:-158, z1:154, h:56 };

/* the four measured states, report pp.32-34 */
const STEPS = [
  { rate:55,  name:'Baseline · one operator' },
  { rate:89,  name:'Second operator added' },
  { rate:100, name:'Second manual workstation added' },
  { rate:130, name:'Third operator · priorities tuned' }
];

const UNIT = 1 / 40;                 // plan units -> metres
const CX = -2, CZ = 37.5;            // plan centre, so the plate sits on the origin
const wx = x => (x - CX) * UNIT;
const wz = z => (z - CZ) * UNIT;

const BELT_Y = 0.6, CARRY_Y = 1.05;

/* material flow: shelf -> infeed -> mill -> robot -> CMM -> outfeed ->
   manual station -> sink. [x, z, height in metres] */
function flowPath(branch){
  const wsZ = branch === 1 ? MACHINES.ws2.z : MACHINES.ws1.z;
  return [
    [-248, -92, 1.2], [-190, -58, CARRY_Y], [-149, -30, BELT_Y], [101, -30, BELT_Y],
    [150, -62, 1.35], [192, -84, 1.12], [182, 10, 1.5], [206, 92, 1.06],
    [146, 50, 1.3], [101, 26, BELT_Y], [-149, 26, BELT_Y], [-124, wsZ, 1.06],
    [-272, 186, 0.62]
  ];
}

/* the operators' loop: shelf, conveyor ends, beside the stations, sink */
const HUMAN = [
  [-212, -92], [-186, -54], [-166, -30], [-166, 26],
  [-184, 132], [-184, 206], [-238, 186], [-212, -92]
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

function pathPoint(pts, t){
  const seg = (pts.length - 1) * Math.min(0.9999, Math.max(0, t));
  const i = Math.floor(seg), f = seg - i;
  const a = pts[i], b = pts[i + 1];
  return a.map((v, k) => lerp(v, b[k], f));
}

// One model per page: a second call hands back the first instead of stacking
// another canvas and label layer on the same stage.
let instance = null;

export function mount(){
  if (instance) return instance;
  const wrap    = document.getElementById('cellWrap');
  const flat    = document.getElementById('cellFlat');
  const stage   = document.getElementById('cellStage');
  const hint    = document.getElementById('cellHint');
  const rateEl  = document.getElementById('cellRate');
  const readout = document.getElementById('cellReadout');
  const modeEl  = document.getElementById('cellMode');
  const deltaEl = document.getElementById('cellDelta');
  const bView   = document.getElementById('cellView');
  const bReplay = document.getElementById('cellReplay');
  const stepBtns = Array.from(document.querySelectorAll('.cell-stepb'));

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The stage needs a real size before the renderer is created.
  wrap.hidden = false;
  if (flat) flat.setAttribute('hidden', '');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    wrap.hidden = true;
    if (flat) flat.removeAttribute('hidden');
    throw err;
  }

  const sizeOf = () => {
    const r = stage.getBoundingClientRect();
    return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))];
  };
  let [W, H] = sizeOf();

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1.75));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.insertBefore(renderer.domElement, stage.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);

  /* ---------- light ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.6;
  room.dispose(); pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdbe5f4, 0x29211a, 1.9));
  const key = new THREE.DirectionalLight(0xfff1d8, 4);
  key.position.set(-6, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left:-12, right:12, top:10, bottom:-10, near:0.5, far:40 });
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d4ed, 2.8);
  rim.position.set(5, 8, -10);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffbd42, 30, 22, 2);
  warm.position.set(-5, 5, 4);
  scene.add(warm);

  /* ---------- materials: dark metal, ivory, orange ---------- */
  const AMBER = 0xff7a1a, CALM = 0x9fd18a;
  const mat = (color, metalness = 0.1, roughness = 0.4, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const M = {
    body:   mat(0x30363f, 0.75, 0.29),
    base:   mat(0x292f37, 0.85, 0.32),
    edge:   mat(0x707986, 0.85, 0.24),
    chrome: mat(0xc3cad0, 0.92, 0.18),
    dark:   mat(0x12171d, 0.45, 0.38),
    rubber: mat(0x0b1015, 0.1, 0.6),
    deck: mat(0x11151a, 0.25, 0.78),
    amber:  mat(AMBER, 0.52, 0.28),
    ivory:  mat(0xe0ded4, 0.48, 0.26),
    wood:   mat(0xb08a5a, 0.05, 0.8),
    light:  mat(AMBER, 0.2, 0.25, { emissive: AMBER, emissiveIntensity: 1.5 }),
    white:  mat(0xfff3d7, 0.1, 0.3, { emissive: 0xfff0d0, emissiveIntensity: 1.6 }),
    green:  mat(0xc6d9a1, 0.1, 0.3, { emissive: 0x91b364, emissiveIntensity: 0.9 }),
    glass:  mat(0x81949e, 0.45, 0.16, { transparent: true, opacity: 0.2, depthWrite: false })
  };

  const geos = new Map();
  function boxGeo(w, h, d, r){
    const k = `b${w},${h},${d},${r}`;
    if (!geos.has(k)) geos.set(k, r
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3))
      : new THREE.BoxGeometry(w, h, d));
    return geos.get(k);
  }
  function box(parent, w, h, d, x, y, z, m = M.body, r = 0.03){
    const o = new THREE.Mesh(boxGeo(w, h, d, r), m);
    o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function cyl(parent, r, h, x, y, z, m = M.chrome, r2 = r, seg = 20){
    const k = `c${r},${r2},${h},${seg}`;
    if (!geos.has(k)) geos.set(k, new THREE.CylinderGeometry(r, r2, h, seg));
    const o = new THREE.Mesh(geos.get(k), m);
    o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function ball(parent, r, x, y, z, m = M.chrome){
    const k = `s${r}`;
    if (!geos.has(k)) geos.set(k, new THREE.SphereGeometry(r, 16, 12));
    const o = new THREE.Mesh(geos.get(k), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  }
  function canvasTexture(w, h, draw){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const monoFamily = (getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace').trim();
  function print(ctx, txt, x, y, size, color, weight = 500){
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${monoFamily}`;
    ctx.fillText(txt, x, y);
  }
  function decal(parent, w, h, x, y, z, texture){
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  /* ---------- the plate everything stands on ---------- */
  const PW = 15.7, PD = 10.9;
  const cell = new THREE.Group();
  scene.add(cell);

  box(cell, PW + 0.3, 0.38, PD + 0.3, 0, -0.33, 0, M.base, 0.17);
  box(cell, PW + 0.12, 0.055, PD + 0.12, 0, -0.115, 0, M.edge, 0.1);
  box(cell, PW, 0.09, PD, 0, -0.045, 0, M.deck, 0.09);
  box(cell, PW - 0.8, 0.026, 0.032, 0, -0.4, PD / 2 + 0.155, M.light, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    cyl(cell, 0.39, 0.25, sx * (PW / 2 - 0.8), -0.56, sz * (PD / 2 - 0.8), M.rubber);
    cyl(cell, 0.06, 0.026, sx * (PW / 2 - 0.3), 0.012, sz * (PD / 2 - 0.3), M.chrome, 0.06, 12);
  }

  // faint metre grid on the deck
  {
    const pts = [];
    for (let x = -Math.floor(PW / 2); x <= PW / 2; x++) pts.push(new THREE.Vector3(x, 0.004, -PD / 2 + 0.25), new THREE.Vector3(x, 0.004, PD / 2 - 0.25));
    for (let z = -Math.floor(PD / 2); z <= PD / 2; z++) pts.push(new THREE.Vector3(-PW / 2 + 0.25, 0.004, z), new THREE.Vector3(PW / 2 - 0.25, 0.004, z));
    cell.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x8a94a0, transparent: true, opacity: 0.13 })));
  }

  // engraved nameplate on the front edge of the deck
  {
    const tex = canvasTexture(1536, 176, (c, w, h) => {
      c.fillStyle = '#252b32'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4d545c'; c.lineWidth = 2; c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'FACTORY CELL', 45, 79, 40, '#d9d8cd', 650);
      print(c, '·  machine tending + manual assembly', 400, 79, 32, '#b8bdc1', 450);
      print(c, 'ISAN3110 MODELLING & SIMULATION   /   VISUAL COMPONENTS', 47, 133, 19, '#737e88', 500);
      print(c, '55 → 130 / h', 1290, 130, 23, '#c57e45');
    });
    const plate = decal(cell, 6.4, 0.73, 3.9, 0.006, PD / 2 - 0.62, tex);
    plate.rotation.x = -Math.PI / 2;
  }

  // soft shadow under the plate
  {
    const tex = canvasTexture(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(64, 64, 12, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(0.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.45, PD * 1.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.69;
    scene.add(contact);
  }

  /* ---------- components ---------- */
  const comps = {};            // key -> { group, top }
  function component(key, x, z, top){
    const g = new THREE.Group();
    g.position.set(wx(x), 0, wz(z));
    cell.add(g);
    comps[key] = { group: g, top };
    return g;
  }

  /* warehouse shelf */
  {
    const m = MACHINES.shelf, g = component('shelf', m.x, m.z, m.h * UNIT);
    const w = m.w * UNIT, d = m.d * UNIT, h = m.h * UNIT;
    for (const sx of [-1, 1]) for (const fz of [-1, 0, 1])
      box(g, 0.07, h, 0.07, sx * (w / 2 - 0.035), h / 2, fz * (d / 2 - 0.035), M.edge, 0.01);
    const tints = [M.ivory, M.amber, M.dark, M.ivory, M.body];
    [0.22, 0.82, 1.42, 2.02].forEach((y, level) => {
      box(g, w, 0.05, d, 0, y, 0, M.dark, 0.01);
      for (let i = 0; i < 4; i++){
        if ((i + level) % 5 === 3) continue;
        box(g, w * 0.72, 0.3, 0.52, 0, y + 0.18, -d / 2 + 0.45 + i * 0.68, tints[(i * 2 + level) % tints.length], 0.03);
      }
    });
    box(g, w + 0.04, 0.12, d + 0.04, 0, h + 0.05, 0, M.amber, 0.03);
  }

  /* twin conveyors */
  const belts = [];
  function conveyor(key, dir){
    const m = MACHINES[key], g = component(key, m.x, m.z, 0.62);
    const len = m.w * UNIT, d = m.d * UNIT;
    box(g, len, 0.12, d - 0.1, 0, 0.42, 0, M.dark, 0.03);
    box(g, len - 0.16, 0.03, d - 0.16, 0, 0.5, 0, M.rubber, 0);
    for (const sz of [-1, 1]) box(g, len, 0.07, 0.04, 0, 0.54, sz * (d / 2 - 0.02), M.chrome, 0.012);
    for (let i = 0; i <= 5; i++) for (const sz of [-1, 1]){
      const x = -len / 2 + 0.2 + i * (len - 0.4) / 5;
      cyl(g, 0.035, 0.38, x, 0.19, sz * (d / 2 - 0.1), M.chrome, 0.035, 10);
      cyl(g, 0.07, 0.02, x, 0.01, sz * (d / 2 - 0.1), M.dark, 0.07, 10);
    }
    for (const sx of [-1, 1]){
      const r = cyl(g, 0.085, d - 0.12, sx * (len / 2 - 0.02), 0.45, 0, M.chrome, 0.085, 16);
      r.rotation.x = Math.PI / 2;
    }
    box(g, 0.34, 0.22, 0.2, dir * (len / 2 - 0.4), 0.25, d / 2 - 0.02, M.amber, 0.03);
    const count = 44, spacing = (len - 0.2) / count;
    const slats = new THREE.InstancedMesh(boxGeo(0.05, 0.014, d - 0.2, 0), M.body, count);
    slats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    slats.receiveShadow = true;
    g.add(slats);
    belts.push({ slats, count, spacing, len, dir });
  }
  conveyor('convIn', 1);       // towards the robot cell
  conveyor('convOut', -1);     // back out to the stations
  const dummy = new THREE.Object3D();
  function updateBelts(travel){
    for (const b of belts){
      const span = b.count * b.spacing;
      for (let i = 0; i < b.count; i++){
        let x = (i * b.spacing + travel * b.dir) % span;
        if (x < 0) x += span;
        dummy.position.set(x - span / 2, 0.518, 0);
        dummy.updateMatrix();
        b.slats.setMatrixAt(i, dummy.matrix);
      }
      b.slats.instanceMatrix.needsUpdate = true;
    }
  }
  updateBelts(0);

  /* vertical mill: an enclosure open to the robot side, spindle inside */
  let spindle;
  {
    const m = MACHINES.mill, g = component('mill', m.x, m.z, 2.62);
    const w = m.w * UNIT, d = m.d * UNIT;
    box(g, w, 0.5, d, 0, 0.25, 0, M.dark, 0.05);
    box(g, 0.12, 1.75, d - 0.08, -w / 2 + 0.1, 1.37, 0, M.body, 0.03);
    box(g, 0.12, 1.75, d - 0.08, w / 2 - 0.1, 1.37, 0, M.body, 0.03);
    box(g, w - 0.08, 1.75, 0.12, 0, 1.37, -d / 2 + 0.1, M.body, 0.03);
    box(g, w - 0.04, 0.14, d - 0.04, 0, 2.3, 0, M.body, 0.04);
    box(g, w - 0.3, 0.2, d - 0.3, 0, 2.46, 0, M.amber, 0.05);
    box(g, w - 0.08, 0.3, 0.1, 0, 2.08, d / 2 - 0.09, M.body, 0.02);
    box(g, w - 0.08, 0.34, 0.1, 0, 0.67, d / 2 - 0.09, M.body, 0.02);
    box(g, w - 0.3, 1.1, 0.02, 0, 1.38, d / 2 - 0.09, M.glass, 0);
    box(g, w - 0.5, 0.03, 0.04, 0, 1.9, d / 2 - 0.16, M.white, 0.01);
    // inside: table, column, head, spindle
    box(g, 1.15, 0.12, 0.85, 0, 0.92, 0.1, M.chrome, 0.02);
    box(g, 0.5, 1.4, 0.4, 0, 1.2, -0.55, M.ivory, 0.04);
    box(g, 0.52, 0.42, 0.7, 0, 1.78, -0.12, M.ivory, 0.05);
    spindle = new THREE.Group();
    spindle.position.set(0, 1.42, 0.1);
    g.add(spindle);
    cyl(spindle, 0.09, 0.3, 0, 0, 0, M.chrome);
    cyl(spindle, 0.03, 0.22, 0, -0.24, 0, M.dark, 0.012, 10);
    // control pendant with a small screen, and a status beacon
    box(g, 0.42, 0.6, 0.1, w / 2 + 0.16, 1.45, d / 2 - 0.25, M.dark, 0.03);
    const screen = canvasTexture(256, 320, (c, cw, ch) => {
      c.fillStyle = '#111b20'; c.fillRect(0, 0, cw, ch);
      print(c, 'MILL', 20, 46, 30, '#acb9b8', 600);
      print(c, 'RUN', 20, 96, 44, '#ff7a1a', 650);
      for (let i = 0; i < 5; i++){ c.fillStyle = i === 1 ? '#ff7a1a' : '#334348'; c.fillRect(20, 132 + i * 34, 216 - (i % 3) * 40, 9); }
    });
    decal(g, 0.34, 0.42, w / 2 + 0.16, 1.5, d / 2 - 0.195, screen);
    cyl(g, 0.04, 0.3, w / 2 - 0.3, 2.7, -d / 2 + 0.3, M.chrome, 0.04, 10);
    cyl(g, 0.07, 0.1, w / 2 - 0.3, 2.9, -d / 2 + 0.3, M.green, 0.07, 14);
    cyl(g, 0.07, 0.1, w / 2 - 0.3, 3.0, -d / 2 + 0.3, M.light, 0.07, 14);
  }

  /* coordinate measuring machine: slab, moving bridge, probe */
  let bridge, carriage, quill;
  {
    const m = MACHINES.cmm, g = component('cmm', m.x, m.z, 2.2);
    const w = m.w * UNIT, d = m.d * UNIT;
    box(g, w, 0.74, d, 0, 0.37, 0, M.body, 0.06);
    box(g, w - 0.08, 0.14, d - 0.08, 0, 0.82, 0, M.dark, 0.03);
    box(g, w - 0.5, 0.03, 0.04, 0, 0.6, d / 2 + 0.005, M.light, 0.01);
    bridge = new THREE.Group();
    g.add(bridge);
    for (const sx of [-1, 1]) box(bridge, 0.14, 1.05, 0.22, sx * (w / 2 - 0.14), 1.41, 0, M.ivory, 0.03);
    box(bridge, w - 0.1, 0.22, 0.28, 0, 2.02, 0, M.ivory, 0.05);
    carriage = new THREE.Group();
    carriage.position.y = 2.02;
    bridge.add(carriage);
    box(carriage, 0.32, 0.32, 0.36, 0, 0, 0, M.amber, 0.05);
    quill = new THREE.Group();
    carriage.add(quill);
    box(quill, 0.09, 0.9, 0.09, 0, -0.42, 0, M.chrome, 0.01);
    ball(quill, 0.035, 0, -0.9, 0, M.light);
    cyl(g, 0.11, 0.14, 0.1, 0.96, 0, M.amber, 0.11, 18);   // the part being measured
  }

  /* articulated robot: turret, two-link arm, gripper */
  const robot = { L1: 1.12, L2: 1.05, SH: 0.72 };
  {
    const m = MACHINES.robot, g = component('robot', m.x, m.z, 2.15);
    cyl(g, 0.36, 0.16, 0, 0.08, 0, M.dark, 0.4, 24);
    robot.turret = new THREE.Group();
    g.add(robot.turret);
    cyl(robot.turret, 0.27, 0.34, 0, 0.33, 0, M.amber, 0.3, 24);
    box(robot.turret, 0.34, 0.4, 0.42, 0, 0.66, 0, M.body, 0.08);
    robot.shoulder = new THREE.Group();
    robot.shoulder.position.set(0, robot.SH, 0);
    robot.turret.add(robot.shoulder);
    const sj = cyl(robot.shoulder, 0.17, 0.5, 0, 0, 0, M.chrome, 0.17, 20); sj.rotation.x = Math.PI / 2;
    box(robot.shoulder, robot.L1, 0.2, 0.24, robot.L1 / 2, 0, 0, M.ivory, 0.07);
    robot.elbow = new THREE.Group();
    robot.elbow.position.set(robot.L1, 0, 0);
    robot.shoulder.add(robot.elbow);
    const ej = cyl(robot.elbow, 0.13, 0.4, 0, 0, 0, M.chrome, 0.13, 20); ej.rotation.x = Math.PI / 2;
    box(robot.elbow, robot.L2, 0.15, 0.18, robot.L2 / 2, 0, 0, M.ivory, 0.06);
    robot.wrist = new THREE.Group();
    robot.wrist.position.set(robot.L2, 0, 0);
    robot.elbow.add(robot.wrist);
    const wj = cyl(robot.wrist, 0.085, 0.24, 0, 0, 0, M.amber, 0.085, 16); wj.rotation.x = Math.PI / 2;
    box(robot.wrist, 0.12, 0.14, 0.26, 0.1, 0, 0, M.dark, 0.02);
    for (const sz of [-1, 1]) box(robot.wrist, 0.16, 0.04, 0.035, 0.22, 0, sz * 0.1, M.dark, 0.008);
    robot.held = cyl(robot.wrist, 0.085, 0.12, 0.27, 0, 0, M.amber, 0.085, 16);
    robot.held.rotation.z = Math.PI / 2;
    // stops: [plan x, plan z, reach height, carrying away from here?]
    const stop = (px, pz, reachMax, h) => {
      const dx = (px - m.x) * UNIT, dz = (pz - m.z) * UNIT;
      return { yaw: Math.atan2(-dz, dx), r: Math.min(reachMax, Math.hypot(dx, dz)), h };
    };
    robot.stops = [
      stop(101, -30, 2.05, 0.92),      // pick from the infeed
      stop(192, -88, 1.5, 1.28),       // load the mill
      stop(206, 92, 1.55, 1.3),        // onto the CMM
      stop(101, 26, 2.0, 0.92)         // place on the outfeed
    ];
  }
  function poseRobot(u){
    const n = robot.stops.length;
    const leg = Math.floor(u * n) % n, f = (u * n) % 1;
    const A = robot.stops[leg], B = robot.stops[(leg + 1) % n];
    const lift = smooth((f - 0.2) / 0.16) * (1 - smooth((f - 0.72) / 0.16));
    const turn = smooth((f - 0.34) / 0.4);
    let dy = B.yaw - A.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    const yaw = A.yaw + dy * turn;
    const r = lerp(lerp(A.r, B.r, turn), 1.15, lift);
    const h = lerp(lerp(A.h, B.h, turn), 1.7, lift);
    // two-link reach to (r, h) from the shoulder
    const { L1, L2, SH } = robot;
    const px = r, py = h - SH;
    const D = Math.min(L1 + L2 - 0.02, Math.hypot(px, py));
    const a2 = -Math.acos(Math.max(-1, Math.min(1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
    const a1 = Math.atan2(py, px) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
    robot.turret.rotation.y = yaw;
    robot.shoulder.rotation.z = a1;
    robot.elbow.rotation.z = a2;
    robot.wrist.rotation.z = -(a1 + a2) - Math.PI / 2;      // gripper points down
    robot.held.visible = leg !== n - 1 && f > 0.12 && f < 0.9;
  }
  poseRobot(0);

  /* safety fence: posts, rails, mesh panels; open where the conveyors pass */
  {
    const g = new THREE.Group();
    cell.add(g);
    comps.fence = { group: g, top: FENCE.h * UNIT, anchor: null };
    const h = FENCE.h * UNIT;
    const meshTex = canvasTexture(128, 128, (c, w, hh) => {
      c.clearRect(0, 0, w, hh);
      c.strokeStyle = 'rgba(176,186,196,.95)'; c.lineWidth = 3;
      for (let i = 0; i <= w; i += 16){ c.beginPath(); c.moveTo(i, 0); c.lineTo(i, hh); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
    });
    meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
    const gapA = wz(-30 - 18), gapB = wz(26 + 18);
    const X0 = wx(FENCE.x0), X1 = wx(FENCE.x1), Z0 = wz(FENCE.z0), Z1 = wz(FENCE.z1);
    function run(ax, az, bx, bz){
      const len = Math.hypot(bx - ax, bz - az), alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const n = Math.max(1, Math.round(len / 1.3));
      for (let i = 0; i <= n; i++){
        const px = lerp(ax, bx, i / n), pz = lerp(az, bz, i / n);
        box(g, 0.06, h, 0.06, px, h / 2, pz, M.body, 0.01);
        box(g, 0.09, 0.05, 0.09, px, h + 0.02, pz, M.amber, 0.01);
      }
      for (const y of [0.12, h - 0.04]){
        const rail = box(g, alongX ? len : 0.035, 0.035, alongX ? 0.035 : len, (ax + bx) / 2, y, (az + bz) / 2, M.edge, 0);
        rail.castShadow = false;
      }
      const tex = meshTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 0.5, (h - 0.16) / 0.5);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.16),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }));
      panel.position.set((ax + bx) / 2, h / 2 + 0.04, (az + bz) / 2);
      if (!alongX) panel.rotation.y = Math.PI / 2;
      g.add(panel);
    }
    run(X0, Z0, X1, Z0);            // back
    run(X1, Z0, X1, Z1);            // right
    run(X0, Z1, X1, Z1);            // front
    run(X0, Z0, X0, gapA);          // left, behind the conveyors
    run(X0, gapB, X0, Z1);          // left, in front of them
    comps.fence.anchor = new THREE.Vector3(X1 - 0.6, h + 0.1, Z0);
  }

  /* manual workstations: table, back panel, fixture, task light */
  const glow = {};
  function workstation(key){
    const m = MACHINES[key], g = component(key, m.x, m.z, 1.95);
    const w = m.w * UNIT, d = m.d * UNIT;
    box(g, w, 0.06, d, 0, 0.92, 0, M.ivory, 0.025);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      cyl(g, 0.035, 0.9, sx * (w / 2 - 0.12), 0.45, sz * (d / 2 - 0.12), M.chrome, 0.035, 10);
      box(g, 0.16, 0.03, 0.16, sx * (w / 2 - 0.12), 0.015, sz * (d / 2 - 0.12), M.dark, 0.01);
    }
    box(g, 0.05, 0.95, d, w / 2 - 0.03, 1.42, 0, M.body, 0.02);          // back panel
    box(g, 0.02, 0.5, d - 0.3, w / 2 - 0.065, 1.5, 0, M.ivory, 0.01);
    box(g, 0.5, 0.14, 0.4, 0.1, 1.02, 0, M.dark, 0.03);                   // fixture
    cyl(g, 0.085, 0.12, 0.1, 1.15, 0, M.amber, 0.085, 16);
    box(g, 0.34, 0.2, 0.26, -0.55, 1.05, -0.38, M.body, 0.03);            // parts bin
    cyl(g, 0.02, 0.7, w / 2 - 0.12, 1.3, d / 2 - 0.16, M.chrome, 0.02, 8);
    box(g, 0.5, 0.035, 0.1, w / 2 - 0.35, 1.66, d / 2 - 0.16, M.dark, 0.012);
    box(g, 0.44, 0.012, 0.07, w / 2 - 0.35, 1.638, d / 2 - 0.16, M.white, 0);
    glow[key] = M.light.clone();
    box(g, 0.03, 0.03, d - 0.1, -w / 2 - 0.005, 0.87, 0, glow[key], 0.01);  // status strip on the working edge
    box(g, w - 0.1, 0.03, 0.03, 0, 0.87, d / 2 + 0.005, glow[key], 0.01);
  }
  workstation('ws1');
  workstation('ws2');

  /* sink: a pallet of finished parts */
  {
    const m = MACHINES.sink, g = component('sink', m.x, m.z, 0.75);
    const w = m.w * UNIT;
    for (const sz of [-1, 0, 1]) box(g, w, 0.1, 0.12, 0, 0.05, sz * (w / 2 - 0.06), M.wood, 0.01);
    for (let i = 0; i < 5; i++) box(g, 0.17, 0.03, w, -w / 2 + 0.085 + i * (w - 0.17) / 4, 0.115, 0, M.wood, 0.005);
    box(g, w - 0.06, 0.26, w - 0.06, 0, 0.26, 0, M.body, 0.03);
    box(g, w - 0.14, 0.02, w - 0.14, 0, 0.395, 0, M.dark, 0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      cyl(g, 0.085, 0.12, -0.28 + i * 0.28, 0.46, -0.28 + j * 0.28, M.amber, 0.085, 14);
  }

  /* the constraint, marked on the deck around station 1 */
  const zoneMat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9 });
  {
    const m = MACHINES.ws1, w = m.w * UNIT / 2 + 0.75, d = m.d * UNIT / 2 + 0.28, y = 0.012;
    const pts = [[-w, -d], [w - 0.35, -d], [w - 0.35, d], [-w, d]].map(p => new THREE.Vector3(wx(m.x) + p[0], y, wz(m.z) + p[1]));
    const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), zoneMat);
    cell.add(loop);
  }

  /* material flow, dashed on the deck */
  const flowMats = [0, 1].map(() => new THREE.LineDashedMaterial({
    color: AMBER, transparent: true, opacity: 0.38, dashSize: 0.22, gapSize: 0.16 }));
  const flowLines = [0, 1].map(b => {
    const pts = flowPath(b).map(p => new THREE.Vector3(wx(p[0]), 0.01, wz(p[1])));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), flowMats[b]);
    line.computeLineDistances();
    cell.add(line);
    return line;
  });

  /* parts in flow */
  const PARTS = Array.from({ length: 26 }, (_, i) => ({ t: i / 26, slot: i / 26, branch: i % 2 }));
  const partMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 14), M.amber, PARTS.length);
  partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  partMesh.castShadow = true;
  partMesh.frustumCulled = false;
  cell.add(partMesh);
  const paths = [flowPath(0), flowPath(1)];

  /* operators: one, then two, then three */
  const OPS = [0, 0.34, 0.67].map(t => {
    const g = new THREE.Group();
    cell.add(g);
    for (const sx of [-1, 1]) box(g, 0.11, 0.82, 0.14, sx * 0.075, 0.41, 0, M.dark, 0.03);
    box(g, 0.36, 0.56, 0.2, 0, 1.1, 0, M.ivory, 0.07);
    box(g, 0.375, 0.2, 0.215, 0, 1.2, 0, M.amber, 0.03);            // hi-vis band
    for (const sx of [-1, 1]) box(g, 0.085, 0.5, 0.1, sx * 0.225, 1.1, 0.04, M.ivory, 0.035);
    ball(g, 0.125, 0, 1.56, 0, M.ivory);
    box(g, 0.2, 0.025, 0.16, 0, 1.69, 0.03, M.amber, 0.01);          // cap
    cyl(g, 0.07, 0.1, 0, 0.98, 0.2, M.amber, 0.07, 12);              // the part in hand
    return { t, group: g };
  });

  /* ---------- state ---------- */
  let stepF = 0, stepTarget = 0;
  let build = reduce ? 1 : 0;
  let shownRate = 55;
  let phase = 0, travel = 0, clock = 0;
  const BUILD_S = 2.4;

  function rateAt(f){
    f = Math.max(0, Math.min(STEPS.length - 1, f));
    const i = Math.min(STEPS.length - 2, Math.floor(f));
    return lerp(STEPS[i].rate, STEPS[i + 1].rate, clamp01(f - i));
  }
  const ws2Alpha = () => clamp01(stepF - 1);            // station 2 arrives at step 2
  function opAlpha(i){
    if (i === 0) return 1;
    if (i === 1) return clamp01(stepF);                 // 2nd operator at step 1
    return clamp01(stepF - 2);                          // 3rd operator at step 3
  }
  // The report's constraint: the manual station, not the machines. Parts crawl
  // through it at baseline, so the backlog sits there and the robot waits.
  const speedAt = t => (t > 0.80 && t < 0.94) ? lerp(0.16, 1, clamp01(stepF / 3)) : 1;

  const calm = new THREE.Color(CALM), amber = new THREE.Color(AMBER), mix = new THREE.Color();

  function applyState(){
    const t3 = clamp01(stepF / 3);
    const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 3.2);

    // build: each component rises from the plate in turn
    ORDER.forEach((k, i) => {
      const local = ease(clamp01((build * (ORDER.length + 2) - i) / 2.6));
      const shown = MACHINES[k] && MACHINES[k].added ? ease(ws2Alpha()) : 1;
      const s = local * shown;
      const g = comps[k].group;
      g.visible = s > 0.002;
      g.scale.set(1, Math.max(0.002, s), 1);
      comps[k].alpha = s;
    });
    const live = build > 0.95 ? 1 : 0;

    // the constraint glows hot at baseline and settles as it is worked out
    mix.copy(amber).lerp(calm, t3);
    glow.ws1.color.copy(mix); glow.ws1.emissive.copy(mix);
    glow.ws1.emissiveIntensity = lerp(1.6 + 1.8 * pulse, 0.8, t3);
    glow.ws2.color.copy(mix); glow.ws2.emissive.copy(mix);
    glow.ws2.emissiveIntensity = 0.8;
    zoneMat.opacity = live * clamp01((1.2 - stepF) / 1.2) * (0.55 + 0.45 * pulse);
    flowMats[0].opacity = 0.38 * build;
    flowMats[1].opacity = 0.38 * build * ws2Alpha();
    flowLines[1].visible = ws2Alpha() > 0.02;

    // parts
    const twoStations = ws2Alpha() > 0.5;
    PARTS.forEach((p, i) => {
      const q = pathPoint(paths[twoStations ? p.branch : 0], p.t);
      dummy.position.set(wx(q[0]), q[2], wz(q[1]));
      dummy.scale.setScalar(live ? 1 : 0.0001);
      dummy.updateMatrix();
      partMesh.setMatrixAt(i, dummy.matrix);
    });
    dummy.scale.setScalar(1);
    partMesh.instanceMatrix.needsUpdate = true;

    // operators walk their loop, facing the way they go
    OPS.forEach((o, i) => {
      const a = live * ease(opAlpha(i));
      o.group.visible = a > 0.01;
      if (!o.group.visible) return;
      const p = pathPoint(HUMAN, o.t), n = pathPoint(HUMAN, (o.t + 0.004) % 1);
      o.group.position.set(wx(p[0]), reduce ? 0 : Math.abs(Math.sin(o.t * 140)) * 0.025, wz(p[1]));
      if (n[0] !== p[0] || n[1] !== p[1]) o.group.rotation.y = Math.atan2(n[0] - p[0], n[1] - p[1]);
      o.group.scale.setScalar(Math.max(0.01, a));
    });

    // machines
    poseRobot(phase);
    spindle.position.y = 1.42 - 0.13 * (0.5 + 0.5 * Math.sin(clock * 2.1));
    spindle.rotation.y = clock * 9;
    bridge.position.z = Math.sin(clock * 0.5) * 0.45;
    carriage.position.x = Math.sin(clock * 0.83) * 0.5;
    quill.position.y = -0.08 * (0.5 + 0.5 * Math.sin(clock * 1.7));
    updateBelts(travel);

    rateEl.textContent = Math.round(shownRate);
  }

  /* ---------- callouts: one row of labels along the top, leaders down ---------- */
  const labelLayer = document.createElement('div');
  labelLayer.className = 'cell-labels mono';
  labelLayer.setAttribute('aria-hidden', 'true');
  stage.appendChild(labelLayer);
  const labels = ORDER.filter(k => MACHINES[k]).map(k => {
    const m = MACHINES[k];
    const el = document.createElement('span');
    el.className = 'cell-lab' + (m.hot ? ' hot' : '');
    el.textContent = m.label;
    const lead = document.createElement('i');
    lead.className = 'cell-lead';
    el.style.opacity = lead.style.opacity = 0;
    labelLayer.append(lead, el);
    return { key: k, el, lead, anchor: new THREE.Vector3(wx(m.x), comps[k].top + 0.08, wz(m.z)), half: 0 };
  });
  const note = document.createElement('span');
  note.className = 'cell-lab cell-note hot';
  note.textContent = 'Constraint · manual operations';
  labelLayer.appendChild(note);
  const noteAnchor = new THREE.Vector3(wx(MACHINES.ws1.x), 0, wz(MACHINES.ws1.z + MACHINES.ws1.d / 2) + 0.35);
  let noteHalf = 0, bandBottom = 0;
  function measureLabels(){
    labels.forEach(L => { L.half = L.el.offsetWidth / 2 + 6; });
    noteHalf = note.offsetWidth / 2 + 6;
  }
  const v = new THREE.Vector3();
  function toScreen(p){
    v.copy(p).project(camera);
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }
  function layoutLabels(){
    const EDGE = 8, BAND0 = 6, ROWH = 17;
    const live = labels.filter(L => {
      const a = comps[L.key].alpha > 0.85 ? 1 : 0;
      if (MACHINES[L.key].hot) L.el.classList.toggle('hot', stepF < 2.5);
      L.el.style.opacity = L.lead.style.opacity = a;
      return a;
    });
    live.forEach(L => {
      const p = comps[L.key].group.position;
      v.set(p.x, L.anchor.y, p.z);
      [L.x, L.y] = toScreen(v);
      L.lx = Math.max(L.half + EDGE, Math.min(W - L.half - EDGE, L.x));
    });
    const rowRight = [];
    let maxRow = 0;
    live.sort((a, b) => a.lx - b.lx).forEach(L => {
      let row = 0;
      while (rowRight[row] !== undefined && L.lx - L.half < rowRight[row]) row++;
      rowRight[row] = L.lx + L.half;
      L.row = row;
      if (row > maxRow) maxRow = row;
    });
    bandBottom = BAND0 + (maxRow + 1) * ROWH;
    live.forEach(L => {
      const top = BAND0 + L.row * ROWH;
      L.el.style.transform = `translate(${Math.round(L.lx - L.half + 6)}px,${top}px)`;
      const from = top + ROWH - 1, len = L.y - from;
      if (len > 6){
        L.lead.style.transform = `translate(${Math.round(L.x)}px,${from}px)`;
        L.lead.style.height = Math.round(len) + 'px';
      } else {
        L.lead.style.opacity = 0;
      }
    });
    // the constraint call-out, baseline only
    const na = build > 0.95 ? clamp01((1.2 - stepF) / 1.2) : 0;
    note.style.opacity = na;
    if (na > 0){
      const [nx, ny] = toScreen(noteAnchor);
      const x = Math.max(noteHalf + EDGE, Math.min(W - noteHalf - EDGE, nx));
      const y = Math.max(bandBottom + 4, Math.min(H - 20, ny + 8));
      note.style.transform = `translate(${Math.round(x - noteHalf + 6)}px,${Math.round(y)}px)`;
    }
  }

  /* ---------- camera ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI * 0.47;        // stay above the floor
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  // On a touch screen an up-or-down swipe still scrolls the page; a sideways
  // swipe turns the model and a pinch zooms it.
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) renderer.domElement.style.touchAction = stage.style.touchAction = 'pan-y';
  // The page keeps the plain wheel for scrolling; pinch (or Ctrl + wheel) zooms.
  stage.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }, { capture: true });

  const deg = Math.PI / 180;
  const VIEWS = {
    // from the operators' side, looking down across the stations to the cell
    iso: { dir: new THREE.Vector3(), label: 'Top view' },
    // straight down, laid out as in the report's Fig. 37
    top: { dir: new THREE.Vector3(0, 1, 0.012).normalize(), label: '3/4 view' }
  };
  // A squarer stage (a phone) gets a steeper look so the plate fills it.
  function aimIso(){
    const az = -20 * deg, el = (W / H < 1.6 ? 38 : 23) * deg;
    VIEWS.iso.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  let view = 'iso';
  const target = new THREE.Vector3(0, 0.7, 0);
  const goal = new THREE.Vector3();
  let cameraAnimating = false, dragging = false;
  // What has to stay in frame: the plate, and the top of every component.
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-0.55, 0])
    corners.push(new THREE.Vector3(sx * (PW / 2 + 0.15), y, sz * (PD / 2 + 0.15)));
  for (const k of Object.keys(MACHINES)){
    const m = MACHINES[k], top = comps[k].top + 0.15;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      corners.push(new THREE.Vector3(wx(m.x + sx * m.w / 2), top, wz(m.z + sz * m.d / 2)));
  }

  // Fit: the distance at which everything fills the stage from a direction,
  // and how far the picture then has to shift to sit centred under the
  // callout row. The shift is a view offset, so the orbit centre stays put.
  const FIT_X = 0.96;
  let viewOff = 0, goalOff = 0;
  function measure(dir, d){
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let ex = 0, y0 = Infinity, y1 = -Infinity;
    for (const c of corners){
      v.copy(c).project(camera);
      ex = Math.max(ex, Math.abs(v.x));
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    return { ex, half: (y1 - y0) / 2, mid: (y1 + y0) / 2 };
  }
  function fitView(dir){
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // Leave the callout rows their space at the top: a narrow stage needs
    // more rows for the same names.
    const rows = Math.max(1, Math.ceil(labels.reduce((sum, L) => sum + L.half * 2, 0) / (W * 0.72)));
    const top = 1 - 2 * (10 + rows * 17 + 10) / H, bottom = -1 + 2 * 16 / H;
    const fitY = Math.max(0.3, (top - bottom) / 2), centreY = (top + bottom) / 2;
    let d = 30;
    for (let pass = 0; pass < 5; pass++){
      const e = measure(dir, d);
      d *= Math.max(e.ex / FIT_X, e.half / fitY);
    }
    return { d, off: (centreY - measure(dir, d).mid) * H / 2 };
  }
  function applyOffset(){
    camera.setViewOffset(W, H, 0, viewOff, W, H);
    camera.updateProjectionMatrix();
  }
  // mode: 'snap' jumps to the view, 'ease' glides to it, 'keep' leaves the
  // camera where the reader put it and only refreshes the limits.
  function setGoal(mode){
    const saved = camera.position.clone(), savedQ = camera.quaternion.clone();
    const fit = fitView(VIEWS[view].dir);
    camera.position.copy(saved); camera.quaternion.copy(savedQ);
    goal.copy(target).addScaledVector(VIEWS[view].dir, fit.d);
    goalOff = fit.off;
    controls.minDistance = fit.d * 0.4;
    controls.maxDistance = fit.d * 1.5;
    if (mode === 'snap'){
      camera.position.copy(goal);
      controls.target.copy(target);
      viewOff = goalOff;
      cameraAnimating = false;
    } else if (mode === 'ease'){
      cameraAnimating = true;
    }
    applyOffset();
    controls.update();
  }
  function resize(){
    [W, H] = sizeOf();
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    aimIso();
    measureLabels();
    setGoal(dragging || userMoved ? 'keep' : 'snap');
    requestRender();
  }
  let userMoved = false;
  controls.addEventListener('start', () => { dragging = true; cameraAnimating = false; userMoved = true; hint.classList.add('gone'); });
  controls.addEventListener('end', () => { dragging = false; });
  controls.addEventListener('change', requestRender);

  /* ---------- loop: runs only while the figure is on screen ---------- */
  let inView = false, running = false, seen = false, last = performance.now(), queued = false, lost = false;
  function requestRender(){
    if (running || queued || lost) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; drawFrame(0); });
  }
  function drawFrame(dt){
    if (cameraAnimating && !dragging){
      const k = 1 - Math.exp(-dt * 3.2);
      camera.position.lerp(goal, dt ? k : 1);
      controls.target.lerp(target, dt ? k : 1);
      viewOff = lerp(viewOff, goalOff, dt ? k : 1);
      applyOffset();
      if (camera.position.distanceTo(goal) < 0.02) cameraAnimating = false;
    }
    controls.update();
    applyState();
    layoutLabels();
    renderer.render(scene, camera);
  }
  function frame(now){
    if (!inView || lost){ running = false; return; }
    // rAF's timestamp can be a hair earlier than the clock read in start().
    const dt = Math.max(0, Math.min(64, now - last)) / 1000;
    last = now;

    if (build < 1) build = Math.min(1, build + dt / BUILD_S);
    if (stepF !== stepTarget){
      const d = Math.sign(stepTarget - stepF) * dt / 0.75;
      stepF = Math.abs(stepTarget - stepF) <= Math.abs(d) ? stepTarget : stepF + d;
    }
    // line speed tracks the measured output at this step
    const boost = rateAt(stepF) / 55;
    clock += dt;
    travel += dt * 0.42 * boost;
    phase = (phase + dt * 0.055 * boost) % 1;
    PARTS.forEach(p => {
      p.t += dt * 0.055 * speedAt(p.t) * boost;
      if (p.t > 1) p.t -= 1;
      // Relieving the constraint dissolves the backlog: parts ease back to
      // even spacing instead of carrying the baseline queue forever.
      const relief = clamp01(stepF / 3);
      if (relief > 0.02){
        let d = ((phase + p.slot) % 1) - p.t;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        p.t += d * Math.min(1, dt * 0.9 * relief);
        if (p.t > 1) p.t -= 1;
        if (p.t < 0) p.t += 1;
      }
    });
    OPS.forEach((o, i) => { o.t = (o.t + dt * 0.03 * (0.9 + i * 0.16) * boost) % 1; });
    shownRate += (rateAt(stepF) - shownRate) * Math.min(1, dt * 4);

    drawFrame(dt);
    requestAnimationFrame(frame);
  }
  function start(){
    if (running || reduce) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------- controls ---------- */
  function setStep(n){
    stepTarget = n;
    stepBtns.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.step === n)));
    modeEl.textContent = STEPS[n].name;
    readout.classList.toggle('opt', n === STEPS.length - 1);
    const pct = Math.round((STEPS[n].rate / STEPS[0].rate - 1) * 100);
    deltaEl.textContent = n === 0 ? 'Baseline' : '+' + pct + '% vs baseline';
    if (reduce){ stepF = n; shownRate = STEPS[n].rate; requestRender(); }
  }
  stepBtns.forEach(b => b.addEventListener('click', () => setStep(+b.dataset.step)));

  bView.addEventListener('click', () => {
    view = view === 'iso' ? 'top' : 'iso';
    bView.textContent = VIEWS[view].label;
    userMoved = false;
    setGoal(reduce ? 'snap' : 'ease');
    requestRender();
  });
  bView.textContent = VIEWS[view].label;

  bReplay.addEventListener('click', () => {
    if (reduce) return;
    build = 0;
    PARTS.forEach((p, i) => { p.t = i / PARTS.length; });
    OPS.forEach((o, i) => { o.t = [0, 0.34, 0.67][i]; });
  });
  if (reduce) bReplay.hidden = true;

  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { lost = false; requestRender(); if (inView) start(); });

  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'Interactive 3D model of the factory cell: a warehouse shelf, infeed and outfeed conveyors, a vertical mill, a robot and a coordinate measuring machine inside a safety fence, manual assembly stations and a sink. Drag to rotate, pinch to zoom. The step buttons below add operators and a second station, raising output from 55 to 130 units per hour.');
  hint.textContent = (touch ? 'Swipe to rotate' : 'Drag to rotate') + ' · pinch to zoom';

  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.compile(scene, camera);
  drawFrame(0);

  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (!inView) return;
    // the drag hint stays up for a while after the reader first gets here
    if (!seen){ seen = true; setTimeout(() => hint.classList.add('gone'), 9000); }
    if (reduce) requestRender(); else start();
  }, { rootMargin: '0px 0px -15% 0px' }).observe(stage);

  // For checks and screenshots: jump past the build-in.
  instance = {
    finishBuild(){ build = 1; requestRender(); },
    jumpToStep(n){ setStep(n); stepF = n; shownRate = STEPS[n].rate; requestRender(); }
  };
  return instance;
}
