/*  cosmo weather — renderer
    Austere frame, maximal content. Everything outside the dial is grid and type;
    everything inside the circle is computed light.

    Channel map (one variable, one channel):
      moon phase        global exposure, line weight
      dignity           chroma (clarity)
      aspects           geometry {n/k} + colour law (light / pigment)
      sect              which light leads the field
      retrograde/slow   blur of the primitive the planet owns
      outer planets     optics: iridescence, brilliance, lensing
*/
(function (CW) {
  'use strict';
  const C = CW.corr, K = CW.color, G = CW.glyphs, E_ = CW.engine;
  const TAU = Math.PI * 2;
  const INK = '#ebe7dc';            // off-white, the only colour the frame owns
  const MIDNIGHT = '#070c26';
  const VOID = '#02030a';
  const STAR = '#ffffff';            // reserved for constellations

  const supportsFilter = (() => {
    try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(2px)'; return c.filter === 'blur(2px)'; }
    catch (e) { return false; }
  })();
  let FAST = false;                       // scrubbing at speed: skip blurs and the neptune pass
  function withBlur(ctx, px, fn) {
    if (FAST || px < 0.35) return fn();
    if (supportsFilter) { ctx.save(); ctx.filter = `blur(${px.toFixed(2)}px)`; fn(); ctx.restore(); return; }
    const a = ctx.globalAlpha;
    ctx.save(); ctx.globalAlpha = a / 3;
    for (const [dx, dy] of [[-px, 0], [px, 0], [0, -px], [0, px]]) { ctx.save(); ctx.translate(dx * 0.6, dy * 0.6); fn(); ctx.restore(); }
    ctx.restore();
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  /* ---------- colour of things ---------- */
  function signColorAt(lon) {
    const L = E_.norm360(lon), i = Math.floor(L / 30), d = L % 30;
    const c = C.SIGNS[i].color;
    if (d > 28) return K.mixLight(c, C.SIGNS[(i + 1) % 12].color, (d - 28) / 4, 0);
    if (d < 2) return K.mixLight(c, C.SIGNS[(i + 11) % 12].color, (2 - d) / 4, 0);
    return c;
  }
  /* core = tincture, nudged ≤15% toward the sign; clarity from dignity */
  function coreColor(state, key) {
    const P = C.PLANETS[key], b = state.bodies[key];
    if (key === 'saturn') return P.tincture;
    let c = K.mixLight(P.tincture, signColorAt(b.lon), P.kind === 'optic' ? 0.05 : 0.15, 0);
    c = K.clarify(c, b.clarity);
    if (b.combust) c = K.mixLight(c, '#fff6dc', 0.35, 0.05);
    return c;
  }
  /* presence: what a planet contributes to a figure — core leaning further into its aura */
  function presence(state, key) {
    const b = state.bodies[key], P = C.PLANETS[key];
    if (key === 'saturn') return P.tincture;
    if (key === 'neptune') return '#eef3ff';
    if (key === 'pluto') return '#2a1418';
    if (key === 'uranus') return K.mixLight('#cfe3f0', signColorAt(b.lon), 0.35, 0.02);
    return K.clarify(K.mixLight(P.tincture, signColorAt(b.lon), 0.3, 0), b.clarity);
  }
  const lightness = c => K.lab(c)[0];

  /* ---------- layout ---------- */
  function layout(S) {
    const u = S / 2048;
    return {
      S, u, cx: S / 2, cy: S * 0.452,
      Rb: S * 0.404,                  // dodecagon circumradius — the container
      Rz: S * 0.358,                  // bezel inner edge / zodiac ring outer
      Rzi: S * 0.338,                 // zodiac ring inner
      R: S * 0.333,                   // sky
      capY: S * 0.893
    };
  }
  /* mundane placement: angle = Placidian time position, radius = altitude */
  function skyPoint(Lt, b) {
    const th = Math.PI - b.p * Math.PI / 6;
    const r = Lt.R * (0.56 + 0.39 * clamp(Math.abs(b.alt) / 90));
    return { x: Lt.cx + r * Math.cos(th), y: Lt.cy - r * Math.sin(th), th, r };
  }
  /* ecliptic placement: the rete, rotated so the ascendant sits on the eastern horizon */
  const eclAngle = (state, lon) => Math.PI + (lon - state.asc) * Math.PI / 180;
  const polar = (Lt, th, r) => ({ x: Lt.cx + r * Math.cos(th), y: Lt.cy - r * Math.sin(th) });

  /* ---------- noise ---------- */
  function hash(i, j, s) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, o = 4) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f, s + i * 17); f *= 2.03; a *= 0.5; }
    return v / (1 - Math.pow(0.5, o));
  }

  /* ---------- the field: three lights, midnight between ---------- */
  function lights(state, Lt) {
    const B = state.bodies, day = state.sect === 'day';
    const sp = skyPoint(Lt, B.sun), mp = skyPoint(Lt, B.moon);
    const toU = p => ({ x: (p.x - Lt.cx) / Lt.R, y: (p.y - Lt.cy) / Lt.R });
    return [
      { name: 'ascendant', pos: { x: -1.0, y: 0 }, color: signColorAt(state.asc), w: 0.30, sigma: 0.62 },
      { name: 'sun', pos: toU(sp), color: signColorAt(B.sun.lon), w: (day ? 0.45 : 0.25) * (B.sun.alt > 0 ? 1 : 0.5), sigma: 0.55 },
      { name: 'moon', pos: toU(mp), color: signColorAt(B.moon.lon), w: (day ? 0.25 : 0.45) * (0.45 + 0.55 * state.moon.illum), sigma: 0.48 }
    ];
  }
  const fieldCache = { key: null, canvas: null };

  /* The field: three lights over midnight — ascendant from the eastern horizon, sun and moon where
     they stand, in their sign colours, weighted by sect. Pure light, no texture: a colour field. */
  function buildLight(state, Lt, N) {
    const key = ['l', N, Math.round(state.date.getTime() / 60000), state.loc.lat, state.loc.lon].join('|');
    if (fieldCache.key === key) return fieldCache.canvas;
    const cv = fieldCache.canvas && fieldCache.canvas.width === N ? fieldCache.canvas : document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const lin = c => K.hexToRgb(c).map(v => Math.pow(v, 2.2));
    const L = lights(state, Lt).map(l => ({ ...l, lin: lin(l.color) }));
    const base = lin(MIDNIGHT);
    const E = 0.6 + 0.4 * state.moon.illum;
    const ext = 1.08;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) * 2 - 1) * ext, y = (j / (N - 1) * 2 - 1) * ext;
      const rr = x * x + y * y, o = (j * N + i) * 4;
      if (rr > ext * ext) { img.data[o + 3] = 0; continue; }
      let r = base[0], gg = base[1], b = base[2];
      for (const l of L) {
        const dx = x - l.pos.x, dy = y - l.pos.y;
        const f = 0.95 * l.w * Math.exp(-(dx * dx + dy * dy) / (2 * l.sigma * l.sigma));
        r += l.lin[0] * f; gg += l.lin[1] * f; b += l.lin[2] * f;
      }
      const under = 1 - 0.22 * smooth(0, 0.35, y);           // below the horizon: under the earth
      const vig = 0.72 + 0.28 * (1 - Math.min(1, rr));
      const k = E * under * vig;
      img.data[o] = 255 * Math.pow(1 - Math.exp(-r * k * 2.2), 1 / 2.2);
      img.data[o + 1] = 255 * Math.pow(1 - Math.exp(-gg * k * 2.2), 1 / 2.2);
      img.data[o + 2] = 255 * Math.pow(1 - Math.exp(-b * k * 2.2), 1 / 2.2);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    fieldCache.key = key; fieldCache.canvas = cv;
    return cv;
  }

  function buildField(state, Lt, N) {
    const key = [N, Math.round(state.date.getTime() / 60000), state.loc.lat, state.loc.lon].join('|');
    if (fieldCache.key === key) return fieldCache.canvas;
    const cv = fieldCache.canvas && fieldCache.canvas.width === N ? fieldCache.canvas : document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const lin = c => K.hexToRgb(c).map(v => Math.pow(v, 2.2));
    // each light carries two neighbouring hues; the smoke drifts between them
    const L = lights(state, Lt).map(l => ({ ...l, lin: lin(l.color), linA: lin(K.hueShift(l.color, -28)), linB: lin(K.hueShift(K.shade(l.color, 0.06), 30)) }));
    const base = K.hexToRgb(MIDNIGHT).map(c => Math.pow(c, 2.2));
    const E = 0.6 + 0.4 * state.moon.illum;
    const seed = Math.floor(state.date.getTime() / 864e5);   // one weather per day, drifting with the hour
    const drift = (state.date.getTime() / 3600e3) % 1000 * 0.07;
    const ext = 1.08;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) * 2 - 1) * ext, y = (j / (N - 1) * 2 - 1) * ext;
      const rr = x * x + y * y;
      const o = (j * N + i) * 4;
      if (rr > ext * ext) { img.data[o + 3] = 0; continue; }
      // domain-warped fbm: smoke, not stars
      const qx = fbm(x * 1.6 + drift, y * 1.6, seed, 3), qy = fbm(x * 1.6 + 5.2, y * 1.6 - drift, seed + 3, 3);
      const n1 = fbm(x * 2.2 + 3.0 * qx, y * 2.2 + 3.0 * qy, seed + 7, 4);
      const n2 = fbm(x * 4.1 - 1.7 * qy, y * 4.1 + 1.7 * qx, seed + 11, 3);
      const veil = Math.pow(n1, 1.8);
      const n3 = fbm(x * 1.3 - qy, y * 1.3 + qx, seed + 19, 3);                  // hue drift
      const lane = smooth(0.28, 0.72, fbm(x * 2.8 + 2 * qy, y * 2.8 - 2 * qx, seed + 23, 4)); // dust lanes
      const rid = 1 - Math.abs(2 * fbm(x * 5.2 + 4 * qx, y * 5.2 + 4 * qy, seed + 29, 4) - 1);
      const fil = Math.pow(rid, 7);                                                // filaments
      const dust = 0.38 + 0.62 * lane;
      let r = base[0] * (0.45 + 0.8 * n2), gg = base[1] * (0.45 + 0.8 * n2), b = base[2] * (0.5 + 0.9 * n2);
      for (const l of L) {
        const dx = x - l.pos.x, dy = y - l.pos.y;
        const fall = l.w * Math.exp(-(dx * dx + dy * dy) / (2 * l.sigma * l.sigma));
        const f = fall * (0.12 + 1.6 * veil * dust + 0.9 * fil);
        const h = n3;
        r += (l.linA[0] * (1 - h) + l.linB[0] * h) * f;
        gg += (l.linA[1] * (1 - h) + l.linB[1] * h) * f;
        b += (l.linA[2] * (1 - h) + l.linB[2] * h) * f;
      }
      const under = 1 - 0.22 * smooth(0, 0.35, y);           // below the horizon: under the earth
      const vig = 0.72 + 0.28 * (1 - Math.min(1, rr));
      const k = E * under * vig;
      img.data[o] = 255 * Math.pow(1 - Math.exp(-r * k * 2.2), 1 / 2.2);
      img.data[o + 1] = 255 * Math.pow(1 - Math.exp(-gg * k * 2.2), 1 / 2.2);
      img.data[o + 2] = 255 * Math.pow(1 - Math.exp(-b * k * 2.2), 1 / 2.2);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    fieldCache.key = key; fieldCache.canvas = cv;
    return cv;
  }

  /* ---------- Harris weave: the pencil of circles of the two luminaries ---------- */
  function drawWeave(ctx, state, Lt, lw, E) {
    const B = state.bodies;
    const s = skyPoint(Lt, B.sun), m = skyPoint(Lt, B.moon);
    const mx = (s.x + m.x) / 2, my = (s.y + m.y) / 2;
    let dx = m.x - s.x, dy = m.y - s.y;
    let c = Math.hypot(dx, dy) / 2;
    const sunC = K.mixLight(C.PLANETS.sun.tincture, signColorAt(B.sun.lon), 0.4, 0.05);
    const moonC = K.mixLight(C.PLANETS.moon.tincture, signColorAt(B.moon.lon), 0.4, 0.05);
    const blurPx = 5 * Lt.u * B.venus.slow;           // venus owns the curves
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = lw * 0.9;
    withBlur(ctx, blurPx, () => {
      if (c < Lt.R * 0.03) {                            // conjunction: the pencil collapses to rings
        ctx.strokeStyle = K.rgba(sunC, 0.10 * E);
        for (let i = 1; i <= 9; i++) { ctx.beginPath(); ctx.arc(mx, my, Lt.R * 0.09 * i, 0, TAU); ctx.stroke(); }
        return;
      }
      const ux = dx / (2 * c), uy = dy / (2 * c), nx = -uy, ny = ux;
      // elliptic family: every circle through both lights
      ctx.strokeStyle = K.rgba(sunC, 0.085 * E);
      for (let i = 1; i < 12; i++) {
        const a = i * Math.PI / 12, t = c / Math.tan(a), r = c / Math.sin(a);
        ctx.beginPath(); ctx.arc(mx + nx * t, my + ny * t, r, 0, TAU); ctx.stroke();
      }
      // hyperbolic family: Apollonian circles separating them
      ctx.strokeStyle = K.rgba(moonC, 0.085 * E);
      for (let i = 1; i <= 9; i++) for (const sg of [-1, 1]) {
        const sh = i * 0.22, cth = Math.cosh(sh) / Math.sinh(sh), r = c / Math.sinh(sh);
        ctx.beginPath(); ctx.arc(mx + sg * ux * c * cth, my + sg * uy * c * cth, r, 0, TAU); ctx.stroke();
      }
    });
    ctx.restore();
  }

  /* prismatic rays of the day sun — mercury owns rays */
  function drawRays(ctx, state, Lt, E) {
    const B = state.bodies;
    if (B.sun.alt <= 0) return;
    const s = skyPoint(Lt, B.sun);
    const col = signColorAt(B.sun.lon);
    const n = 24, len = Lt.R * 1.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    withBlur(ctx, 6 * Lt.u * B.mercury.slow, () => {
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = a0 + TAU / n * 0.42;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, len);
        const c = i % 2 ? col : C.PLANETS.sun.tincture;
        g.addColorStop(0, K.rgba(c, 0.10 * E)); g.addColorStop(1, K.rgba(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + len * Math.cos(a0), s.y + len * Math.sin(a0));
        ctx.lineTo(s.x + len * Math.cos(a1), s.y + len * Math.sin(a1));
        ctx.closePath(); ctx.fill();
      }
    });
    ctx.restore();
  }

  /* ---------- figures: the rose engine ---------- */
  function hardness(cfg) {
    let h = { soft: 0.08, fusion: 0.3, creative: 0.42, fated: 0.55, hard: 0.86 }[cfg.nature] ?? 0.5;
    for (const p of [cfg.a, cfg.b]) { h -= 0.18 * (C.BENEFIC[p] || 0); h += 0.12 * (C.MALEFIC[p] || 0); }
    return clamp(h, 0, 1);
  }
  function figureColor(state, cfg) {
    const a = presence(state, cfg.a), b = presence(state, cfg.b);
    if (cfg.a === 'pluto') return b;             // pluto lends no pigment
    if (cfg.b === 'pluto') return a;
    if (cfg.nature === 'hard') return K.mixPigment(a, b, 0.3);
    return K.mixLight(a, b, 0.5, cfg.nature === 'fusion' ? 0.06 : 0.03);
  }
  /* star polygon {n/k} vertices; k = 0 or n < 3 handled by caller */
  function starVerts(cx, cy, r, n, rot) {
    const v = [];
    for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; v.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }); }
    return v;
  }
  /* the edges of {n/k}, as segments, for both drawing and constellation */
  function starEdges(verts, n, k) {
    const e = [];
    if (n < 3) return e;
    for (let i = 0; i < n; i++) e.push([verts[i], verts[(i + k) % n]]);
    return e;
  }

  function strokeGlow(ctx, path, color, lw, alpha, E, accent) {
    const dark = lightness(color) < 0.22;
    if (dark) {                                         // saturn and pluto carve: black groove, edged by the other force
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = K.rgba('#000000', 0.85 * alpha); ctx.lineWidth = lw * 3.2; ctx.stroke(path);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = K.rgba(accent || C.PLANETS.saturn.rim, 0.75 * alpha); ctx.lineWidth = lw * 0.6; ctx.stroke(path);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = K.rgba(color, 0.14 * alpha * E); ctx.lineWidth = lw * 5; ctx.stroke(path);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = K.rgba(color, 0.7 * alpha); ctx.lineWidth = lw; ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
  }

  function roseBand(n, passes, h, R, rot, cx, cy, kStar) {
    const paths = [];
    const P = Math.max(2, n);
    for (let j = 0; j < passes; j++) {
      const rho = 0.48 + 0.5 * (j + 1) / passes;
      const amp = (0.05 + 0.1 * (1 - j / passes)) * (1 + 0.6 * h);
      const ph = j * Math.PI / (P * passes) * (kStar || 1);
      const p = new Path2D();
      const M = 720;
      for (let s = 0; s <= M; s++) {
        const th = s / M * TAU;
        const x = ((P * (th - rot + ph)) / TAU) % 1;        // 0..1 within a petal
        const tri = Math.abs(2 * ((x + 1) % 1) - 1);         // 1 at petal tip, 0 between
        const soft = 0.5 + 0.5 * Math.cos((1 - tri) * Math.PI);
        const hard = Math.pow(tri, 4.5);
        const f = soft + (hard - soft) * h;
        const r = R * rho * (1 - amp + amp * f);
        const px = cx + r * Math.cos(th), py = cy - r * Math.sin(th);
        s === 0 ? p.moveTo(px, py) : p.lineTo(px, py);
      }
      p.closePath();
      paths.push(p);
    }
    return paths;
  }

  /* draws one configuration; returns its constellation-eligible geometry */
  function drawFigure(ctx, state, Lt, cfg, R, role, lw, E, t) {
    const B = state.bodies;
    const n = cfg.n, k = cfg.k;
    const rot = eclAngle(state, B[cfg.a].lon);
    const h = hardness(cfg);
    const col = figureColor(state, cfg);
    const pa = presence(state, cfg.a), pb = presence(state, cfg.b);
    const accent = lightness(pa) > lightness(pb) ? pa : pb;
    const dark = lightness(col) < 0.22;   // when the mix goes black, the lighter force edges the groove
    const primary = role === 'primary';
    const alpha = primary ? 1 : 0.38;
    R *= 1 + 0.006 * Math.sin(t * 0.6 + (primary ? 0 : 2));
    const cx = Lt.cx, cy = Lt.cy;
    const blur = {
      curves: 5 * Lt.u * B.venus.slow,
      rays: 5 * Lt.u * B.mercury.slow,
      points: 4 * Lt.u * B.mars.slow,
      halos: 6 * Lt.u * B.jupiter.slow
    };
    const iris = cfg.a === 'uranus' || cfg.b === 'uranus';
    const colAt = i => iris ? K.hueShift(col, 40 * Math.sin(t * 0.5 + i * 1.3)) : col;
    const sg = (p, c, w, a) => strokeGlow(ctx, p, c, w, a, E, accent);
    ctx.save();
    const geo = { verts: [], edges: [], power: cfg.power, role };

    // halo — jupiter
    withBlur(ctx, blur.halos, () => {
      const p = new Path2D(); p.arc(cx, cy, R * 1.02, 0, TAU); p.moveTo(cx + R * 1.055, cy); p.arc(cx, cy, R * 1.055, 0, TAU);
      sg(p, colAt(0), lw * (dark ? 0.3 : 0.6), alpha * (dark ? 0.45 : 0.6));
    });

    // rose-engine band — curves (venus); primary only, two counter-phased sets make the moiré
    if (primary) {
      const passes = clamp(Math.round(5 + 4 * Math.min(1, cfg.power)), 5, 9);
      const nP = n === 1 ? ((C.PLANETS[cfg.a].number || 0) + (C.PLANETS[cfg.b].number || 0) || 12) : n;
      const bandA = roseBand(nP, passes, h, R, rot, cx, cy, k);
      const bandB = roseBand(nP * 2, passes, Math.min(1, h + 0.2), R * 0.985, rot + Math.PI / nP, cx, cy, k + 1);
      withBlur(ctx, blur.curves, () => {
        bandA.forEach((p, i) => sg(p, colAt(i), lw * 0.55, alpha * (0.4 + 0.5 * i / passes)));
        bandB.forEach((p, i) => sg(p, colAt(i + 3), lw * 0.35, alpha * (0.18 + 0.25 * i / passes)));
      });
    }

    // stained glass: translucent facets in the figure (harris)
    const facet = path => {
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      if (dark) { g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0.05)'); ctx.globalCompositeOperation = 'source-over'; }
      else { g.addColorStop(0, K.rgba(col, 0.22 * alpha * E)); g.addColorStop(0.7, K.rgba(col, 0.08 * alpha * E)); g.addColorStop(1, K.rgba(col, 0)); ctx.globalCompositeOperation = 'lighter'; }
      ctx.fillStyle = g; ctx.fill(path, 'evenodd');
      ctx.restore();
    };

    if (n === 1) {                                        // conjunction: the monad
      const disc = new Path2D(); disc.arc(cx, cy, R * 0.75, 0, TAU); disc.moveTo(cx + R * 0.5, cy); disc.arc(cx, cy, R * 0.5, 0, TAU);
      if (primary) facet(disc);
      // fusion: the two numbers add into one rose, r = cos(P·θ/2) — P petals (sun 6 + venus 7 = 13)
      const P = (C.PLANETS[cfg.a].number || 0) + (C.PLANETS[cfg.b].number || 0) || 12;
      const rose = new Path2D();
      for (let s2 = 0; s2 <= 1440; s2++) {
        const th = s2 / 1440 * TAU * 2;
        const r = R * 0.86 * Math.abs(Math.cos(P * (th - rot) / 2));
        const x = cx + r * Math.cos(th), y = cy - r * Math.sin(th);
        s2 ? rose.lineTo(x, y) : rose.moveTo(x, y);
      }
      if (primary) facet(rose);
      withBlur(ctx, blur.curves, () => {
        sg(rose, colAt(0), lw * 1.1, alpha);
        for (let i = 1; i <= 2; i++) { const p = new Path2D(); p.arc(cx, cy, R * (0.3 * i), 0, TAU); sg(p, colAt(i), lw * 0.7, alpha * 0.7); }
      });
      const ring = starVerts(cx, cy, R * 0.75, 12, rot);
      geo.verts = ring; for (let i = 0; i < 12; i++) geo.edges.push([ring[i], ring[(i + 1) % 12]]);
    } else if (n === 2) {                                 // opposition: vesica piscis on the axis
      const d = R * 0.42, ax = Math.cos(rot), ay = -Math.sin(rot);
      const ves = new Path2D();
      for (const s of [-1, 1]) { ves.moveTo(cx + s * ax * d / 2 + d, cy + s * ay * d / 2); ves.arc(cx + s * ax * d / 2, cy + s * ay * d / 2, d, 0, TAU); }
      if (primary) facet(ves);
      withBlur(ctx, blur.curves, () => {
        for (const s of [-1, 1]) { const p = new Path2D(); p.arc(cx + s * ax * d / 2, cy + s * ay * d / 2, d, 0, TAU); sg(p, colAt(s), lw, alpha); }
      });
      withBlur(ctx, blur.rays, () => {
        const p = new Path2D(); p.moveTo(cx - ax * R, cy - ay * R); p.lineTo(cx + ax * R, cy + ay * R);
        sg(p, colAt(0), lw * 0.8, alpha);
      });
      geo.verts = [{ x: cx - ax * R * 0.71, y: cy - ay * R * 0.71 }, { x: cx + ax * R * 0.71, y: cy + ay * R * 0.71 }];
      const hx = -ay * d * Math.sqrt(3) / 2, hy = ax * d * Math.sqrt(3) / 2;
      geo.verts.push({ x: cx + hx, y: cy + hy }, { x: cx - hx, y: cy - hy });
      geo.edges.push([geo.verts[0], geo.verts[1]], [geo.verts[2], geo.verts[3]]);
    } else {
      const v = starVerts(cx, cy, R * 0.9, n, rot);
      const edges = starEdges(v, n, k);
      geo.verts = v; geo.edges = edges;
      const chain = new Path2D();
      for (let i = 0; i < n; i++) {
        const a = rot + i * TAU / n, rc = R * 0.45, x0 = cx + rc * Math.cos(a), y0 = cy - rc * Math.sin(a);
        chain.moveTo(x0 + rc, y0); chain.arc(x0, y0, rc, 0, TAU);
      }
      const star = new Path2D();
      for (const [a, b] of edges) {
        star.moveTo(a.x, a.y);
        if (h > 0.6) star.lineTo(b.x, b.y);
        else {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, bow = (0.6 - h) * 0.55;
          star.quadraticCurveTo(mx + (mx - cx) * bow, my + (my - cy) * bow, b.x, b.y);
        }
      }
      if (primary) {
        const poly = new Path2D(); v.forEach((q, i) => (i ? poly.lineTo(q.x, q.y) : poly.moveTo(q.x, q.y)));
        if (k > 1) for (let i = 0; i <= n; i++) { const q = v[(i * k) % n]; i ? poly.lineTo(q.x, q.y) : poly.moveTo(q.x, q.y); }
        poly.closePath();
        facet(h < 0.6 ? chain : poly);
      }
      // soft: circle chain — every circle through the pole (n = 6 is the seed of life)
      if (h < 0.6) withBlur(ctx, blur.curves, () => sg(chain, colAt(1), lw * (0.9 - 0.5 * h), alpha * (1 - 0.6 * h)));
      // star polygon — straight edges for hard, bowed edges for soft
      withBlur(ctx, blur.points, () => {
        sg(star, colAt(0), lw * (0.8 + 0.5 * h), alpha);
        if (h > 0.6) {                                    // points: mars
          const dots = new Path2D(); for (const q of v) { dots.moveTo(q.x + lw * 1.6, q.y); dots.arc(q.x, q.y, lw * 1.6, 0, TAU); }
          sg(dots, colAt(1), lw, alpha);
        }
      });
      // spokes — rays (mercury)
      withBlur(ctx, blur.rays, () => {
        const p = new Path2D();
        for (const q of v) { p.moveTo(cx, cy); p.lineTo(q.x, q.y); }
        sg(p, colAt(2), lw * 0.45, alpha * 0.5);
      });
    }
    ctx.restore();
    return geo;
  }

  /* station: the planet's own number, as hour-marks just outside the portal */
  function drawStation(ctx, state, Lt, st, R, lw, E) {
    const b = state.bodies[st.planet];
    const col = st.planet === 'saturn' ? C.PLANETS.saturn.rim : C.PLANETS[st.planet].kind === 'optic' ? INK : coreColor(state, st.planet);
    const rot = eclAngle(state, b.lon);
    ctx.save();
    if (!st.n) {                                           // pluto: no number. an unbroken dark ring
      const p = new Path2D(); p.arc(Lt.cx, Lt.cy, R * 1.12, 0, TAU);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = lw * 2.4; ctx.stroke(p);
      ctx.strokeStyle = K.rgba(INK, 0.12); ctx.lineWidth = lw * 0.5; ctx.stroke(p);
    } else {
      const p = new Path2D();
      for (let i = 0; i < st.n; i++) {
        const a = rot + i * TAU / st.n, p0 = polar(Lt, a, R * 1.09), p1 = polar(Lt, a, R * 1.16);
        p.moveTo(p0.x, p0.y); p.lineTo(p1.x, p1.y);
      }
      ctx.lineCap = 'round'; ctx.strokeStyle = K.rgba(col, 0.85); ctx.lineWidth = lw * 1.4; ctx.stroke(p);
    }
    ctx.restore();
  }

  /* ---------- constellation: where figures meet, white ---------- */
  function segX(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-9) return null;
    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / d;
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
  }
  function constellation(geos, R) {
    const stars = [];
    const tol = R * 0.035;
    for (let i = 0; i < geos.length; i++) for (let j = i + 1; j < geos.length; j++) {
      const A = geos[i], B = geos[j];
      const w = Math.sqrt(Math.min(1.5, A.power) * Math.min(1.5, B.power));
      for (const a of A.verts) for (const b of B.verts) {
        if (Math.hypot(a.x - b.x, a.y - b.y) < tol) stars.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, b: 1.0 * w + 0.4, major: true });
      }
    }
    // merge near-duplicates, keep the brightest few
    const out = [];
    for (const s of stars.sort((a, b) => b.b - a.b)) {
      const o = out.find(q => Math.hypot(q.x - s.x, q.y - s.y) < tol * 0.6);
      if (o) { o.b = Math.min(2, o.b + s.b * 0.5); o.major = o.major || s.major; } else out.push({ ...s });
    }
    const major = out.filter(s => s.major), minor = out.filter(s => !s.major).slice(0, 8);
    return major.slice(0, 12).concat(minor);
  }
  function drawStars(ctx, stars, Lt, E, t) {
    if (!stars.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const majors = stars.filter(s => s.major);
    if (majors.length > 1) {                              // the figure of the day
      ctx.strokeStyle = K.rgba(STAR, 0.22); ctx.lineWidth = 1.1 * Lt.u;
      ctx.beginPath();
      const c = majors.map(s => ({ ...s, a: Math.atan2(s.y - Lt.cy, s.x - Lt.cx) })).sort((a, b) => a.a - b.a);
      c.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
      ctx.closePath(); ctx.stroke();
    }
    stars.forEach((s, i) => {
      const tw = 0.85 + 0.15 * Math.sin(t * 1.7 + i * 2.1);
      const r = Lt.u * (s.major ? 7 : 3.2) * (0.6 + 0.4 * s.b) * tw;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 5);
      g.addColorStop(0, K.rgba(STAR, 0.9)); g.addColorStop(0.18, K.rgba(STAR, 0.35)); g.addColorStop(1, K.rgba(STAR, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = STAR; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.45, 0, TAU); ctx.fill();
      if (s.major) {                                      // diffraction cross
        ctx.strokeStyle = K.rgba(STAR, 0.55); ctx.lineWidth = Lt.u * 1.2;
        ctx.beginPath(); ctx.moveTo(s.x - r * 4, s.y); ctx.lineTo(s.x + r * 4, s.y); ctx.moveTo(s.x, s.y - r * 4); ctx.lineTo(s.x, s.y + r * 4); ctx.stroke();
      }
    });
    ctx.restore();
  }

  /* ---------- the intelligences ---------- */
  function placeBodies(state, Lt) {
    const pts = C.ORDER.map(k => ({ key: k, ...skyPoint(Lt, state.bodies[k]) }));
    const min = Lt.S * 0.034;
    for (let it = 0; it < 24; it++) {                     // nudge apart along the orbit, never radially
      let moved = false;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < min) {
          const push = (min - d) / (2 * ((a.r + b.r) / 2));
          const s = E_.norm180((a.th - b.th) * 180 / Math.PI) >= 0 ? 1 : -1;
          a.th += s * push; b.th -= s * push;
          for (const q of [a, b]) { q.x = Lt.cx + q.r * Math.cos(q.th); q.y = Lt.cy - q.r * Math.sin(q.th); }
          moved = true;
        }
      }
      if (!moved) break;
    }
    const map = {}; pts.forEach(p => (map[p.key] = p)); return map;
  }

  function drawMoonDisc(ctx, x, y, r, phaseAngle, col) {
    const k = Math.cos(phaseAngle * Math.PI / 180);        // 1 new, -1 full
    ctx.save();
    ctx.fillStyle = '#0b0f1c'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    const waxing = phaseAngle < 180;
    // lit limb on the right when waxing (northern view)
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
    ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? true : false);
    ctx.fill();
    ctx.restore();
  }

  function drawBodies(ctx, state, Lt, pos, E, lw, t, involved) {
    const B = state.bodies;
    for (const key of C.ORDER.slice().reverse()) {
      const b = B[key], P = C.PLANETS[key], q = pos[key];
      const up = b.alt > 0;
      const dim = up ? 1 : 0.55;
      const core = coreColor(state, key);
      const aura = signColorAt(b.lon);
      const inv = involved[key] || 0;
      const auraR = Lt.S * (key === 'sun' ? 0.07 : key === 'moon' ? 0.05 : 0.026 + 0.024 * Math.min(1, inv));
      const coreR = Lt.S * (key === 'sun' ? 0.0125 : key === 'moon' ? 0.0115 : 0.0072);

      // aura — sign colour, purity from dignity
      if (!(key === 'sun' && !up)) {
        const ac = K.clarify(aura, b.clarity);
        withBlur(ctx, 4 * Lt.u * b.slow, () => {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, auraR);
          g.addColorStop(0, K.rgba(ac, 0.5 * E * dim)); g.addColorStop(0.35, K.rgba(ac, 0.16 * E * dim)); g.addColorStop(1, K.rgba(ac, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, auraR, 0, TAU); ctx.fill();
          ctx.restore();
        });
      }

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = dim;
      if (key === 'sun' && !up) {                         // below the horizon the sun is switched off
        ctx.strokeStyle = K.rgba(C.PLANETS.sun.tincture, 0.55); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(q.x, q.y, coreR, 0, TAU); ctx.stroke();
      } else if (key === 'moon') {
        drawMoonDisc(ctx, q.x, q.y, coreR, state.moon.phaseAngle, core);
      } else if (key === 'saturn') {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 1.25, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.rim; ctx.lineWidth = lw * 0.9; ctx.stroke();
      } else if (key === 'uranus') {
        const g = ctx.createConicGradient ? ctx.createConicGradient(t * 0.4, q.x, q.y) : null;
        if (g) { for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, K.hueShift('#c9f0ff', i * 60)); ctx.strokeStyle = g; }
        else ctx.strokeStyle = '#d8ecf6';
        ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.arc(q.x, q.y, coreR, 0, TAU); ctx.stroke();
      } else if (key === 'neptune') {
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, coreR * 3);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(235,242,255,0.35)'); g.addColorStop(1, 'rgba(235,242,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 3, 0, TAU); ctx.fill();
      } else if (key === 'pluto') {
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = lw * 2.2; ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 1.1, 0, TAU); ctx.stroke();
      } else {
        if (key === 'sun') {
          const g = ctx.createRadialGradient(q.x - coreR * 0.3, q.y - coreR * 0.3, 0, q.x, q.y, coreR);
          g.addColorStop(0, '#fff1c4'); g.addColorStop(0.55, core); g.addColorStop(1, K.shade(core, -0.12));
          ctx.fillStyle = g;
        } else ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(q.x, q.y, coreR, 0, TAU); ctx.fill();
      }
      if (b.cazimi) {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = lw * 1.2;
        ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 2.2, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      // glyph, outward of the body
      const gr = Lt.S * 0.0165, off = coreR + gr * 0.9;
      const gx = q.x + Math.cos(q.th) * off, gy = q.y - Math.sin(q.th) * off;
      const ink = K.rgba(INK, (up ? 0.82 : 0.45));
      withBlur(ctx, 2.5 * Lt.u * b.slow, () => G.planet(ctx, key, gx, gy, gr, ink, 0.11));
    }
  }

  /* lensing: pluto bends the space around it */
  function lens(ctx, cx, cy, r, strength) {
    if (strength < 0.05) return;
    const src = ctx.canvas;
    const s = 1 - 0.16 * strength;
    const sx = cx - r * s, sy = cy - r * s, sw = 2 * r * s;
    try {
      const dpr = ctx.getTransform ? ctx.getTransform().a : 1;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(src, sx * dpr, sy * dpr, sw * dpr, sw * dpr, (cx - r) * dpr, (cy - r) * dpr, 2 * r * dpr, 2 * r * dpr);
      ctx.restore();
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.12 * strength})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.restore();
    } catch (e) { /* tainted or unsupported: skip */ }
  }

  /* ---------- the frame: dodecagon container, rete, houses ---------- */
  function dodecagon(Lt, r) {
    const p = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = Math.PI - i * Math.PI / 6;              // a vertex on the eastern horizon, one at the meridian
      const x = Lt.cx + r * Math.cos(a), y = Lt.cy - r * Math.sin(a);
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath(); return p;
  }
  function drawFrame(ctx, state, Lt, lw) {
    const u = Lt.u;
    // container — saturn's black, lead edges
    const outer = dodecagon(Lt, Lt.Rb);
    const ring = new Path2D(outer); ring.arc(Lt.cx, Lt.cy, Lt.Rz, 0, TAU, true);
    ctx.save();
    ctx.fillStyle = VOID; ctx.fill(ring, 'evenodd');
    // saturn slow: the inner edge turns porous
    const sat = state.bodies.saturn.slow;
    const g = ctx.createRadialGradient(Lt.cx, Lt.cy, Lt.Rz * (1 - 0.06 * (0.3 + sat)), Lt.cx, Lt.cy, Lt.Rz);
    g.addColorStop(0, 'rgba(2,3,10,0)'); g.addColorStop(1, `rgba(2,3,10,${0.55 + 0.35 * sat})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.Rz, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.PLANETS.saturn.rim; ctx.lineWidth = 1.2 * u; ctx.stroke(outer);
    ctx.strokeStyle = K.rgba(INK, 0.18); ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.Rz, 0, TAU); ctx.stroke();

    // houses: vertices are cusps, faces are houses. 1 below the eastern horizon, counter-clockwise.
    ctx.font = `400 ${Math.round(17 * u)}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const inR = Lt.Rb * Math.cos(Math.PI / 12);
    for (let i = 0; i < 12; i++) {
      const a = Math.PI - i * Math.PI / 6;
      const p0 = polar(Lt, a, Lt.Rz), p1 = polar(Lt, a, Lt.Rb);
      const angle = i % 3 === 0;
      ctx.strokeStyle = K.rgba(INK, angle ? 0.55 : 0.16); ctx.lineWidth = (angle ? 1.4 : 1) * u;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      const house = 12 - i;                               // face between vertex i and i+1, going clockwise above the horizon
      const am = a - Math.PI / 12;
      const lp = polar(Lt, am, (Lt.Rz + inR) / 2);
      const sunHouse = state.bodies.sun.house === house;
      ctx.fillStyle = K.rgba(sunHouse ? C.PLANETS.sun.tincture : INK, sunHouse ? 0.95 : 0.34);
      ctx.fillText(String(house).padStart(2, '0'), lp.x, lp.y);
    }
    // cardinal labels outside the container
    ctx.font = `400 ${Math.round(19 * u)}px Jost, sans-serif`;
    ctx.fillStyle = K.rgba(INK, 0.55);
    const lab = [['asc', Math.PI], ['mc', Math.PI / 2], ['dsc', 0], ['ic', -Math.PI / 2]];
    for (const [s, a] of lab) { const p = polar(Lt, a, Lt.Rb + 26 * u); ctx.fillText(s, p.x, p.y); }
    ctx.restore();
  }

  /* the rete: a chapter ring. degrees, signs, planet notches. no colour — the colour lives in the sky */
  function drawRete(ctx, state, Lt, lw) {
    const u = Lt.u, rm = (Lt.Rz + Lt.Rzi) / 2;
    ctx.save();
    ctx.fillStyle = VOID;
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.Rz, 0, TAU); ctx.arc(Lt.cx, Lt.cy, Lt.Rzi, 0, TAU, true); ctx.fill('evenodd');
    ctx.strokeStyle = K.rgba(INK, 0.4); ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.Rzi, 0, TAU); ctx.stroke();
    for (let d = 0; d < 360; d++) {
      const a = eclAngle(state, d), major = d % 30 === 0, five = d % 5 === 0;
      if (!five && !major) continue;
      const l = major ? (Lt.Rz - Lt.Rzi) : five && d % 10 === 0 ? 9 * u : 5 * u;
      const p0 = polar(Lt, a, Lt.Rzi), p1 = polar(Lt, a, Lt.Rzi + l);
      ctx.strokeStyle = K.rgba(INK, major ? 0.5 : 0.28); ctx.lineWidth = (major ? 1.2 : 0.8) * u;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const p = polar(Lt, eclAngle(state, i * 30 + 15), rm + 2 * u);
      G.sign(ctx, i, p.x, p.y, (Lt.Rz - Lt.Rzi) * 0.5, K.rgba(INK, 0.62), 0.11);
    }
    // planet notches on the inner edge: true ecliptic longitude, in each planet's tincture
    for (const key of C.ORDER) {
      const a = eclAngle(state, state.bodies[key].lon);
      const p0 = polar(Lt, a, Lt.Rzi), p1 = polar(Lt, a, Lt.Rzi - 14 * u);
      ctx.strokeStyle = key === 'saturn' ? C.PLANETS.saturn.rim : C.PLANETS[key].kind === 'optic' ? K.rgba(INK, 0.7) : K.rgba(coreColor(state, key), 0.95);
      ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- caption: the almanac line ---------- */
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function dms(x) { const d = Math.floor(x), m = Math.floor((x - d) * 60); return `${d}°${String(m).padStart(2, '0')}′`; }
  function fmtTime(date, loc) {
    const tz = loc.tz || 'UTC';
    const f = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
    const parts = Object.fromEntries(f.formatToParts(date).map(p => [p.type, p.value]));
    let zone = loc.zoneLabel;
    if (!zone) {
      try { zone = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName').value.toLowerCase(); }
      catch (e) { zone = tz.toLowerCase(); }
    }
    return { day: parts.weekday.toLowerCase(), date: `${parts.day} ${parts.month.toLowerCase()} ${parts.year}`, time: `${parts.hour}:${parts.minute}`, zone };
  }
  function captionLines(state) {
    const T = fmtTime(state.date, state.loc), B = state.bodies, H = state.hour;
    const sunSign = C.SIGNS[B.sun.sign].name;
    const fig = state.configs.primary;
    return {
      l1: `${T.day} · ${T.date} · ${T.time} ${T.zone} · ${state.loc.name}`,
      l2: `day of ${H.dayRuler} · hour of ${H.hourRuler} · angel of the hour ${H.angel}`,
      l3: `sun in the ${ordinal(B.sun.house)} house · ${dms(B.sun.deg)} ${sunSign}`,
      fig: fig ? `${fig.a} ${fig.aspect} ${fig.b}${fig.event ? ' · ' + fig.event : ''}` : 'quiet sky'
    };
  }
  function drawCaption(ctx, state, Lt) {
    const u = Lt.u, m = Lt.S * 0.0625;
    const c = captionLines(state);
    ctx.save();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.strokeStyle = K.rgba(INK, 0.22); ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.moveTo(m, Lt.capY - 34 * u); ctx.lineTo(Lt.S - m, Lt.capY - 34 * u); ctx.stroke();
    ctx.fillStyle = K.rgba(INK, 0.92); ctx.font = `400 ${Math.round(30 * u)}px Jost, sans-serif`;
    ctx.fillText(c.l1, m, Lt.capY + 8 * u);
    ctx.fillStyle = K.rgba(INK, 0.7); ctx.font = `300 ${Math.round(27 * u)}px Jost, sans-serif`;
    ctx.fillText(c.l2, m, Lt.capY + 50 * u);
    ctx.fillText(c.l3, m, Lt.capY + 88 * u);
    ctx.textAlign = 'right';
    ctx.fillStyle = K.rgba(INK, 0.92); ctx.font = `500 ${Math.round(30 * u)}px Jost, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(4 * u).toFixed(1)}px`;
    ctx.fillText('cosmo weather', Lt.S - m, Lt.capY + 8 * u);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = K.rgba(INK, 0.5); ctx.font = `400 ${Math.round(20 * u)}px "IBM Plex Mono", monospace`;
    ctx.fillText(c.fig, Lt.S - m, Lt.capY + 50 * u);
    ctx.fillText(`moon ${Math.round(state.moon.illum * 100)}% ${state.moon.waxing ? 'waxing' : 'waning'}`, Lt.S - m, Lt.capY + 88 * u);
    ctx.restore();
  }

  /* ---------- clock mode ---------- */
  const ground = state => K.mixLight(VOID, MIDNIGHT, 0.25 + 0.5 * state.moon.illum, 0);
  function renderClock(ctx, state, S, t, opts) {
    const Lt = layout(S);
    const E = 0.62 + 0.38 * state.moon.illum;
    const lw = Lt.u * (1.5 + 1.1 * state.moon.illum);   // the full moon inflates the marks
    const B = state.bodies;

    // ground
    ctx.fillStyle = ground(state);
    ctx.fillRect(0, 0, S, S);

    // sky
    ctx.save();
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.R + 1, 0, TAU); ctx.clip();
    ctx.fillStyle = MIDNIGHT; ctx.fillRect(0, 0, S, S);
    const smoke = opts.field === 'smoke';
    const field = smoke ? buildField(state, Lt, opts.fieldRes || 180) : buildLight(state, Lt, opts.fieldRes || 180);
    ctx.save();
    ctx.translate(Lt.cx, Lt.cy);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(field, -Lt.R * 1.08, -Lt.R * 1.08, Lt.R * 2.16, Lt.R * 2.16);
    ctx.restore();
    drawRays(ctx, state, Lt, E);
    drawWeave(ctx, state, Lt, lw, E);
    // horizon
    ctx.strokeStyle = K.rgba(INK, 0.22); ctx.lineWidth = 1 * Lt.u;
    ctx.beginPath(); ctx.moveTo(Lt.cx - Lt.R, Lt.cy); ctx.lineTo(Lt.cx + Lt.R, Lt.cy); ctx.stroke();

    // the portal
    const cf = state.configs;
    const Rp = Lt.R * 0.5;
    const geos = [];
    const involved = {};
    const all = [cf.primary, ...cf.secondary].filter(Boolean);
    all.forEach(c => { involved[c.a] = Math.max(involved[c.a] || 0, c.power); involved[c.b] = Math.max(involved[c.b] || 0, c.power); });
    const pos = placeBodies(state, Lt);
    // spokes from the planets feeding the primary figure to the pole — mercury owns rays
    if (cf.primary) {
      withBlur(ctx, 5 * Lt.u * B.mercury.slow, () => {
        for (const k of [cf.primary.a, cf.primary.b]) {
          const q = pos[k];
          const col = k === 'saturn' ? C.PLANETS.saturn.rim : presence(state, k);
          ctx.strokeStyle = K.rgba(col, 0.32); ctx.lineWidth = lw * 0.7;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(Lt.cx + (q.x - Lt.cx) * Rp * 1.06 / q.r, Lt.cy + (q.y - Lt.cy) * Rp * 1.06 / q.r); ctx.stroke();
        }
      });
    }
    // secondary first, primary on top
    cf.secondary.slice().reverse().forEach(c => geos.push(drawFigure(ctx, state, Lt, c, Rp, 'secondary', lw * 0.7, E, t)));
    if (cf.primary) {
      const quiet = cf.primary.power < 0.25;
      const g = drawFigure(ctx, state, Lt, cf.primary, Rp * (quiet ? 0.82 : 1), 'primary', lw, E, t);
      geos.push(g);
    }
    cf.stations.forEach(st => drawStation(ctx, state, Lt, st, Rp, lw, E));
    const rippleCol = cf.ripple ? K.mixLight(C.PLANETS.moon.tincture, presence(state, cf.ripple.a === 'moon' ? cf.ripple.b : cf.ripple.a), 0.4, 0) : null;
    if (!opts.plate && rippleCol) drawRipple(ctx, Lt, Rp, rippleCol, lw, E, t);
    const stars = constellation(geos, Rp);
    drawStars(ctx, stars, Lt, E, t);

    drawBodies(ctx, state, Lt, pos, E, lw, t, involved);

    // the pole: day ruler and hour ruler, mixed as light
    {
      const dc = C.PLANETS[state.hour.dayRuler].tincture, hc = C.PLANETS[state.hour.hourRuler].tincture;
      const pc = K.mixLight(dc, hc, 0.5, 0);
      const pr = Lt.S * 0.0105;
      ctx.save();
      const g = ctx.createRadialGradient(Lt.cx, Lt.cy, 0, Lt.cx, Lt.cy, pr * 4);
      g.addColorStop(0, K.rgba(pc, 0.55 * E)); g.addColorStop(1, K.rgba(pc, 0));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, pr * 4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = K.rgba(INK, 0.6); ctx.lineWidth = Lt.u * 1.2; ctx.stroke();
      ctx.strokeStyle = K.rgba(INK, 0.25); ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, pr * 1.8, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // optics after everything inside the sky: pluto bends, neptune diffuses
    const pl = pos.pluto;
    const plStrength = (0.35 + 0.65 * Math.min(1, involved.pluto || 0) + (B.pluto.station ? 0.4 : 0)) * (B.pluto.retro ? 0.6 : 1);
    lens(ctx, pl.x, pl.y, Lt.S * 0.032, Math.min(1, plStrength));
    if (involved.pluto) lens(ctx, Lt.cx, Lt.cy, Rp * 0.3, Math.min(1, involved.pluto) * 0.6);
    const nep = (0.18 + 0.5 * Math.min(1, involved.neptune || 0)) * (B.neptune.retro ? 0.4 : 1);
    if (!FAST && supportsFilter && nep > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = nep * 0.5;
      ctx.filter = `blur(${(14 * Lt.u).toFixed(1)}px)`;
      const dpr = ctx.getTransform().a;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (Lt.cx - Lt.R) * dpr, sw = 2 * Lt.R * dpr;
      ctx.drawImage(ctx.canvas, sx, (Lt.cy - Lt.R) * dpr, sw, sw, sx, (Lt.cy - Lt.R) * dpr, sw, sw);
      ctx.restore();
    }
    ctx.restore(); // sky clip

    drawRete(ctx, state, Lt, lw);
    drawFrame(ctx, state, Lt, lw);
    if (opts.caption !== false) drawCaption(ctx, state, Lt);
    return { mode: 'clock', layout: Lt, positions: pos, stars, rippleCol, Rp, E, lw };
  }

  function drawRipple(ctx, Lt, Rp, col, lw, E, t) {
    const ph = (t * 0.08) % 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = K.rgba(col, 0.22 * (1 - ph) * E); ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Rp * (0.2 + 0.95 * ph), 0, TAU); ctx.stroke();
    ctx.restore();
  }
  /* the living layer over a cached plate: lunar ripple, star breath */
  function overlay(ctx, info, t) {
    if (!info || info.mode !== 'clock') return;
    const Lt = info.layout;
    ctx.save();
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.R, 0, TAU); ctx.clip();
    if (info.rippleCol) drawRipple(ctx, Lt, info.Rp, info.rippleCol, info.lw, info.E, t);
    ctx.globalCompositeOperation = 'lighter';
    info.stars.forEach((s, i) => {
      const a = 0.18 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.1));
      const r = Lt.u * (s.major ? 16 : 7);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, K.rgba(STAR, a)); g.addColorStop(1, K.rgba(STAR, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  /* ---------- chart mode: the plain instrument ---------- */
  function renderChart(ctx, state, S, t, opts) {
    const Lt = layout(S);
    const u = Lt.u, B = state.bodies;
    const E = 0.62 + 0.38 * state.moon.illum;
    ctx.fillStyle = ground(state);
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Lt.R, 0, TAU); ctx.clip();
    ctx.fillStyle = MIDNIGHT; ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.45;
    const field = buildField(state, Lt, opts.fieldRes || 180);
    ctx.drawImage(field, Lt.cx - Lt.R * 1.08, Lt.cy - Lt.R * 1.08, Lt.R * 2.16, Lt.R * 2.16);
    ctx.globalAlpha = 1;
    ctx.restore();

    drawRete(ctx, state, Lt, u);
    // outer black ring with degree ticks
    const outer = new Path2D(); outer.arc(Lt.cx, Lt.cy, Lt.Rb * 0.97, 0, TAU); outer.arc(Lt.cx, Lt.cy, Lt.Rz, 0, TAU, true);
    ctx.fillStyle = VOID; ctx.fill(outer, 'evenodd');
    ctx.strokeStyle = K.rgba(INK, 0.3);
    for (let d = 0; d < 360; d++) {
      const a = eclAngle(state, d), l = d % 10 === 0 ? 16 : d % 5 === 0 ? 10 : 5;
      const p0 = polar(Lt, a, Lt.Rz), p1 = polar(Lt, a, Lt.Rz + l * u);
      ctx.lineWidth = (d % 10 === 0 ? 1.4 : 0.8) * u; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    // house cusps
    const rIn = Lt.R * 0.36;
    for (let h = 1; h <= 12; h++) {
      const a = eclAngle(state, state.cusps[h]);
      const ang = h === 1 || h === 4 || h === 7 || h === 10;
      const p0 = polar(Lt, a, rIn), p1 = polar(Lt, a, ang ? Lt.Rb * 0.97 : Lt.Rzi);
      ctx.strokeStyle = K.rgba(INK, ang ? 0.6 : 0.2); ctx.lineWidth = (ang ? 1.6 : 1) * u;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      const nxt = state.cusps[h % 12 + 1];
      const mid = state.cusps[h] + E_.norm360(nxt - state.cusps[h]) / 2;
      const lp = polar(Lt, eclAngle(state, mid), rIn + 22 * u);
      ctx.fillStyle = K.rgba(INK, 0.35); ctx.font = `400 ${Math.round(16 * u)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(h), lp.x, lp.y);
    }
    ctx.strokeStyle = K.rgba(INK, 0.2); ctx.lineWidth = u;
    ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, rIn, 0, TAU); ctx.stroke();

    // aspects: Itten chords — light for soft, pigment for hard
    const pts = {};
    for (const k of C.ORDER) pts[k] = polar(Lt, eclAngle(state, B[k].lon), rIn);
    ctx.save();
    for (const a of state.aspects.slice().reverse()) {
      if (a.n > 6 && a.n !== 12 && a.power < 0.2) continue;
      const col = figureColor(state, a);
      const p0 = pts[a.a], p1 = pts[a.b];
      ctx.globalCompositeOperation = lightness(col) < 0.22 ? 'source-over' : 'lighter';
      ctx.strokeStyle = K.rgba(lightness(col) < 0.22 ? C.PLANETS.saturn.rim : col, 0.25 + 0.6 * a.exact);
      ctx.lineWidth = u * (0.8 + 2.6 * Math.min(1, a.power));
      ctx.setLineDash(a.nature === 'hard' ? [] : a.nature === 'soft' ? [] : [4 * u, 6 * u]);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();

    // planets on a track, nudged apart
    const track = Lt.R * 0.78;
    const items = C.ORDER.map(k => ({ k, a: eclAngle(state, B[k].lon) })).sort((x, y) => x.a - y.a);
    const minA = 0.075;
    for (let it = 0; it < 30; it++) for (let i = 0; i < items.length; i++) {
      const A = items[i], Bn = items[(i + 1) % items.length];
      let d = E_.norm180((Bn.a - A.a) * 180 / Math.PI) * Math.PI / 180;
      if (d >= 0 && d < minA) { A.a -= (minA - d) / 2; Bn.a += (minA - d) / 2; }
    }
    for (const it of items) {
      const b = B[it.k];
      const p = polar(Lt, it.a, track), tick = polar(Lt, eclAngle(state, b.lon), Lt.Rzi), tick2 = polar(Lt, eclAngle(state, b.lon), Lt.Rzi - 10 * u);
      ctx.strokeStyle = K.rgba(INK, 0.4); ctx.lineWidth = u;
      ctx.beginPath(); ctx.moveTo(tick.x, tick.y); ctx.lineTo(tick2.x, tick2.y); ctx.stroke();
      const col = it.k === 'saturn' ? '#9aa0ab' : C.PLANETS[it.k].kind === 'optic' ? INK : K.mixLight(coreColor(state, it.k), INK, 0.25, 0.05);
      G.planet(ctx, it.k, p.x, p.y, 40 * u, col, 0.1);
      const dp = polar(Lt, it.a, track - 44 * u);
      ctx.fillStyle = K.rgba(INK, 0.6); ctx.font = `400 ${Math.round(15 * u)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.floor(b.deg)}°${b.retro ? 'r' : ''}`, dp.x, dp.y);
    }
    // labels
    ctx.font = `400 ${Math.round(19 * u)}px Jost, sans-serif`; ctx.fillStyle = K.rgba(INK, 0.55);
    for (const [s, h] of [['asc', 1], ['mc', 10], ['dsc', 7], ['ic', 4]]) {
      const p = polar(Lt, eclAngle(state, state.cusps[h]), Lt.Rb + 12 * u);
      ctx.fillText(s, p.x, p.y);
    }
    if (opts.caption !== false) drawCaption(ctx, state, Lt);
    return { mode: 'chart', layout: Lt };
  }

  function render(ctx, state, S, t, opts = {}) {
    FAST = !!opts.fast;
    try { return (opts.mode === 'chart' ? renderChart : renderClock)(ctx, state, S, t, opts); }
    finally { FAST = false; }
  }

  CW.render = { render, overlay, ground, captionLines, layout, signColorAt, coreColor, presence, hardness, figureColor, supportsFilter };
})(window.CW = window.CW || {});
