/* ============================================================
   Hero crowd - hand-drawn busts drifting along the bottom of the paper band,
   parting around the portrait in the middle.

   Plain canvas, no libraries. Adapted from Skiper UI's "Skiper 39" crowd
   canvas (free licence, attribution in the page footer), which is itself
   after a CodePen by zadvorsky. The drawings are Open Peeps by Pablo Stanley
   (CC0), one sheet of 15 x 7 people.

   The portrait and the speech bubble are plain HTML animated in CSS, so the
   greeting never waits on this script or on the crowd image.
   ============================================================ */
(function(){
  "use strict";

  var band = document.getElementById("crowd");
  if (!band) return;
  var cv = band.querySelector(".crowd-cv");
  var me = band.querySelector(".crowd-me");
  var ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  if (!ctx) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SHEET = { src: "assets/crowd.webp", cols: 15, rows: 7, cellW: 240, cellH: 324 };
  var CROSS_S = 10;            // seconds to cross the band at normal pace
  var BOB_S = 0.25;            // one step: up, or back down
  var BOB_PX = 10;
  // Matches the CSS: she starts to rise 1.0s after the go signal, so the
  // crowd has finished making room just as she arrives.
  var PART_DELAY_S = 0.55;
  var PART_S = 0.9;

  var W = 0, H = 0, DPR = 1, k = 1, pw = 0, ph = 0;
  var sheet = new Image();
  var spare = [];              // sheet cells not on stage right now
  var crowd = [];
  var parted = reduce ? 1 : 0; // 0 = people cross the middle, 1 = they duck under it
  var clock = 0;

  function rand(min, max){ return min + Math.random() * (max - min); }
  function smooth(t){ t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  // Lay one person out at the edge they walk in from. Most sit low in the band
  // so only a few torsos show their cut-off bottoms above the front row.
  function send(p){
    p.dir = Math.random() > 0.5 ? 1 : -1;
    p.pace = rand(0.5, 1.5);
    var r = Math.random();
    p.baseY = H - ph + (100 - 250 * r * r) * k;
    p.x = p.dir === 1 ? -pw : W;
    p.step = Math.random() * 2;
    return p;
  }
  function add(){
    var cell = spare.splice((Math.random() * spare.length) | 0, 1)[0];
    var p = send({ cell: cell });
    crowd.push(p);
    return p;
  }
  function recycle(p){
    spare.push(p.cell);
    p.cell = spare.splice((Math.random() * spare.length) | 0, 1)[0];
    send(p);
  }

  function layout(){
    var r = band.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    k = H / 520;
    pw = SHEET.cellW * k;
    ph = SHEET.cellH * k;

    spare = [];
    for (var i = 0; i < SHEET.cols * SHEET.rows; i++) spare.push(i);
    crowd = [];
    var count = Math.max(18, Math.min(SHEET.cols * SHEET.rows, Math.round(W / (pw * 0.2))));
    for (var n = 0; n < count; n++){
      var p = add();
      p.x = rand(-pw, W);      // start mid-walk, not all at the edges
    }
    crowd.sort(function(a, b){ return a.baseY - b.baseY; });
    findSpot();
  }

  // Where the portrait stands, so the crowd can leave it room. Her rise only
  // moves her vertically, so the horizontal box is right at any moment.
  var spot = { cx: 0, half: 0 };
  function findSpot(){
    var b = band.getBoundingClientRect();
    var m = me ? me.getBoundingClientRect() : null;
    if (m && m.width > 0){
      spot.cx = m.left + m.width / 2 - b.left;
      spot.half = m.width / 2;
    } else {
      spot.cx = b.width / 2;
      spot.half = b.height * 0.3;
    }
  }

  function draw(){
    // On a narrow band a full-width gap would empty the stage, so people
    // come closer before they duck.
    var tight = W < 640;
    var g = { cx: spot.cx, half: spot.half * (tight ? 0.62 : 1) };
    var reach = pw * (tight ? 0.45 : 0.9), drop = ph + 170 * k;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < crowd.length; i++){
      var p = crowd[i];
      var tri = p.step % 2;                         // 0..2, one bob up and down
      var bob = BOB_PX * k * smooth(tri < 1 ? tri : 2 - tri);
      var d = Math.abs(p.x + pw / 2 - g.cx);
      var sink = parted * (1 - smooth((d - g.half) / reach)) * drop;
      var y = p.baseY - bob + sink;
      if (y > H) continue;
      var sx = (p.cell % SHEET.cols) * SHEET.cellW, sy = ((p.cell / SHEET.cols) | 0) * SHEET.cellH;
      if (p.dir === 1){
        ctx.drawImage(sheet, sx, sy, SHEET.cellW, SHEET.cellH, p.x, y, pw, ph);
      } else {
        ctx.save();
        ctx.translate(p.x + pw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, sx, sy, SHEET.cellW, SHEET.cellH, 0, 0, pw, ph);
        ctx.restore();
      }
    }
  }

  var running = false, inView = true, last = 0;
  function frame(now){
    if (!inView || document.hidden){ running = false; return; }
    var dt = Math.max(0, Math.min(64, now - last)) / 1000;
    last = now;
    clock += dt;
    parted = smooth((clock - PART_DELAY_S) / PART_S);
    var span = W + pw, resort = false;
    for (var i = 0; i < crowd.length; i++){
      var p = crowd[i];
      p.x += p.dir * (span / CROSS_S) * p.pace * dt;
      p.step += dt * p.pace / BOB_S;
      if (p.dir === 1 ? p.x > W : p.x < -pw){ recycle(p); resort = true; }
    }
    if (resort) crowd.sort(function(a, b){ return a.baseY - b.baseY; });
    draw();
    requestAnimationFrame(frame);
  }
  function start(){
    if (running || reduce) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  if (me && !me.complete) me.addEventListener("load", findSpot);

  sheet.onload = function(){
    layout();
    draw();
    band.classList.add("has-crowd");
    // If the time limit already brought her up, arrive parted rather than
    // walking the crowd through her.
    if (!band.classList.contains("crowd-wait")) clock = PART_DELAY_S + PART_S;
    if (window.__crowdGo) window.__crowdGo();
    if ("ResizeObserver" in window){
      var seenW = W, seenH = H;
      new ResizeObserver(function(){
        var r = band.getBoundingClientRect();
        if (Math.round(r.width) === seenW && Math.round(r.height) === seenH) return;
        layout(); draw();
        seenW = W; seenH = H;
      }).observe(band);
    }
    if ("IntersectionObserver" in window){
      new IntersectionObserver(function(entries){
        inView = entries[0].isIntersecting;
        if (inView) start();
      }).observe(band);
    }
    document.addEventListener("visibilitychange", function(){ if (!document.hidden) start(); });
    start();
  };
  sheet.src = SHEET.src;
})();
