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

  /* ---------- Harris weave: one figure spanning the two luminaries ----------
     The circles through both sun and moon, drawn only between them: a spindle of arcs,
     gold at the sun, silver at the moon. Tight at new moon, spanning the dial at full. */
  function drawWeave(ctx, state, Lt, lw, E) {
    const B = state.bodies;
    const s = skyPoint(Lt, B.sun), m = skyPoint(Lt, B.moon);
    const mx = (s.x + m.x) / 2, my = (s.y + m.y) / 2;
    const dx = m.x - s.x, dy = m.y - s.y;
    const c = Math.hypot(dx, dy) / 2;
    const sunC = K.mixLight(C.PLANETS.sun.tincture, signColorAt(B.sun.lon), 0.35, 0.05);
    const moonC = K.mixLight(C.PLANETS.moon.tincture, signColorAt(B.moon.lon), 0.35, 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = lw * 0.75;
    withBlur(ctx, 5 * Lt.u * B.venus.slow, () => {        // venus owns the curves
      if (c < Lt.R * 0.03) {                            // conjunction: the spindle closes to rings
        ctx.strokeStyle = K.rgba(K.mixLight(sunC, moonC, 0.5, 0), 0.2 * E);
        for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(mx, my, Lt.R * 0.03 * i, 0, TAU); ctx.stroke(); }
        return;
      }
      const g = ctx.createLinearGradient(s.x, s.y, m.x, m.y);
      g.addColorStop(0, K.rgba(sunC, 0.36 * E)); g.addColorStop(1, K.rgba(moonC, 0.36 * E));
      ctx.strokeStyle = g;
      const ux = dx / (2 * c), uy = dy / (2 * c), nx = -uy, ny = ux;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(m.x, m.y); ctx.stroke();
      for (let i = 1; i <= 8; i++) for (const sg of [-1, 1]) {
        const a = i * Math.PI / 18, t = sg * c / Math.tan(a), r = c / Math.sin(a);
        const ox = mx + nx * t, oy = my + ny * t;
        const a1 = Math.atan2(s.y - oy, s.x - ox), a2 = Math.atan2(m.y - oy, m.x - ox);
        let d = a2 - a1; while (d > Math.PI) d -= TAU; while (d <= -Math.PI) d += TAU;
        ctx.beginPath(); ctx.arc(ox, oy, r, a1, a1 + d, d < 0); ctx.stroke();
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

  /* A line holds its colour: core drawn over, glow screened. Black (saturn) is carved, edged by the other force. */
  function strokeGlow(ctx, path, color, lw, alpha, E, accent) {
    const dark = lightness(color) < 0.22;
    if (dark) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = K.rgba('#000000', 0.8 * alpha); ctx.lineWidth = lw * 3; ctx.stroke(path);
      ctx.strokeStyle = K.rgba(accent || C.PLANETS.saturn.rim, 0.8 * alpha); ctx.lineWidth = lw * 0.55; ctx.stroke(path);
      return;
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = K.rgba(color, 0.12 * alpha * E); ctx.lineWidth = lw * 4.5; ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = K.rgba(color, 0.88 * alpha); ctx.lineWidth = lw; ctx.stroke(path);
  }
  /* an edge that passes from one planet to the other: a smooth passage when soft, a hard split when hard */
  function strokeEdge(ctx, a, b, path, cA, cB, hard, lw, alpha, E) {
    const dA = lightness(cA) < 0.22, dB = lightness(cB) < 0.22;
    if (dA || dB) {                                       // saturn's half is a groove
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = K.rgba('#000000', 0.7 * alpha); ctx.lineWidth = lw * 3; ctx.stroke(path);
      if (dA) cA = C.PLANETS.saturn.rim;
      if (dB) cB = C.PLANETS.saturn.rim;
    }
    const grad = op => {
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      if (hard) { g.addColorStop(0, K.rgba(cA, op)); g.addColorStop(0.5, K.rgba(cA, op)); g.addColorStop(0.5, K.rgba(cB, op)); g.addColorStop(1, K.rgba(cB, op)); }
      else { g.addColorStop(0, K.rgba(cA, op)); g.addColorStop(1, K.rgba(cB, op)); }
      return g;
    };
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = grad(0.12 * alpha * E); ctx.lineWidth = lw * 4.5; ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = grad(0.88 * alpha); ctx.lineWidth = lw; ctx.stroke(path);
  }

  /* rose engine: passes twist clockwise (sign +1) or counter-clockwise (sign -1) */
  function roseBand(n, passes, h, R, rot, cx, cy, sign) {
    const paths = [];
    const P = Math.max(2, n);
    for (let j = 0; j < passes; j++) {
      const rho = 0.5 + 0.48 * (j + 1) / passes;
      const amp = (0.05 + 0.1 * (1 - j / passes)) * (1 + 0.6 * h);
      const ph = sign * j * (Math.PI / P) * 0.32;
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

  /* the colour each planet lends a figure; pluto lends none, it compresses the other's */
  function lend(state, key, other, t) {
    if (key === 'pluto') return K.shade(presence(state, other), -0.18);
    const c = presence(state, key);
    return key === 'uranus' ? K.hueShift(c, 50 * Math.sin(t * 0.5)) : c;
  }

  /* draws one configuration; returns its constellation-eligible geometry */
  function drawFigure(ctx, state, Lt, cfg, R, role, lw, E, t) {
    const B = state.bodies;
    const n = cfg.n, k = cfg.k;
    const rot = eclAngle(state, B[cfg.a].lon);
    const h = hardness(cfg);
    const hard = cfg.nature === 'hard';
    const col = figureColor(state, cfg);                 // the relationship: only the translucent fill
    const cA = lend(state, cfg.a, cfg.b, t), cB = lend(state, cfg.b, cfg.a, t + 1.7);
    const accent = lightness(cA) > lightness(cB) ? cA : cB;
    const dark = lightness(col) < 0.22;
    const primary = role === 'primary';
    const alpha = primary ? 1 : 0.38;
    R *= 1 + 0.006 * Math.sin(t * 0.6 + (primary ? 0 : 2));
    const cx = Lt.cx, cy = Lt.cy;
    const blur = { curves: 5 * Lt.u * B.venus.slow, rays: 5 * Lt.u * B.mercury.slow, points: 4 * Lt.u * B.mars.slow };
    const sg = (p, c, w, a) => strokeGlow(ctx, p, c, w, a, E, accent);
    const AB = i => (i % 2 ? cB : cA);
    ctx.save();
    const geo = { verts: [], edges: [], power: cfg.power, role };

    // rose-engine band: planet A's passes twist clockwise, planet B's counter-clockwise
    if (primary) {
      const passes = clamp(Math.round(4 + 3 * Math.min(1, cfg.power)), 4, 7);
      const nP = n === 1 ? ((C.PLANETS[cfg.a].number || 0) + (C.PLANETS[cfg.b].number || 0) || 12) : n;
      const bandA = roseBand(nP, passes, h, R, rot, cx, cy, 1);
      const bandB = roseBand(nP, passes, h, R, rot, cx, cy, -1);
      withBlur(ctx, blur.curves, () => {
        bandA.forEach((p, i) => sg(p, cA, lw * 0.5, alpha * (0.3 + 0.45 * i / passes)));
        bandB.forEach((p, i) => sg(p, cB, lw * 0.5, alpha * (0.3 + 0.45 * i / passes)));
      });
    }

    // stained glass: the relationship as a translucent fill (harris)
    const facet = path => {
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      if (dark) { g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0.05)'); ctx.globalCompositeOperation = 'source-over'; }
      else { g.addColorStop(0, K.rgba(col, 0.2 * alpha * E)); g.addColorStop(0.7, K.rgba(col, 0.08 * alpha * E)); g.addColorStop(1, K.rgba(col, 0)); ctx.globalCompositeOperation = 'screen'; }
      ctx.fillStyle = g; ctx.fill(path, 'evenodd');
      ctx.restore();
    };

    if (n === 1) {                                        // conjunction: two interlaced roses of the summed number
      const P = (C.PLANETS[cfg.a].number || 0) + (C.PLANETS[cfg.b].number || 0) || 12;
      const roseAt = off => {
        const rose = new Path2D();
        for (let s2 = 0; s2 <= 1440; s2++) {
          const th = s2 / 1440 * TAU * 2;
          const r = R * 0.86 * Math.abs(Math.cos(P * (th - rot - off) / 2));
          const x = cx + r * Math.cos(th), y = cy - r * Math.sin(th);
          s2 ? rose.lineTo(x, y) : rose.moveTo(x, y);
        }
        return rose;
      };
      const rA = roseAt(Math.PI / P * 0.12), rB = roseAt(-Math.PI / P * 0.12);
      if (primary) facet(rA);
      withBlur(ctx, blur.curves, () => { sg(rA, cA, lw * 0.9, alpha); sg(rB, cB, lw * 0.9, alpha); });
      const ring = starVerts(cx, cy, R * 0.86, P, rot);
      geo.verts = ring; for (let i = 0; i < P; i++) geo.edges.push([ring[i], ring[(i + 1) % P]]);
    } else if (n === 2) {                                 // opposition: vesica piscis on the axis, one circle each
      const d = R * 0.42, ax = Math.cos(rot), ay = -Math.sin(rot);
      const ves = new Path2D();
      for (const s of [-1, 1]) { ves.moveTo(cx + s * ax * d / 2 + d, cy + s * ay * d / 2); ves.arc(cx + s * ax * d / 2, cy + s * ay * d / 2, d, 0, TAU); }
      if (primary) facet(ves);
      withBlur(ctx, blur.curves, () => {
        for (const s of [1, -1]) { const p = new Path2D(); p.arc(cx + s * ax * d / 2, cy + s * ay * d / 2, d, 0, TAU); sg(p, s > 0 ? cA : cB, lw, alpha); }
      });
      const e0 = { x: cx + ax * R, y: cy + ay * R }, e1 = { x: cx - ax * R, y: cy - ay * R };
      withBlur(ctx, blur.rays, () => { const p = new Path2D(); p.moveTo(e0.x, e0.y); p.lineTo(e1.x, e1.y); strokeEdge(ctx, e0, e1, p, cA, cB, true, lw * 0.8, alpha, E); });
      geo.verts = [{ x: cx - ax * R * 0.71, y: cy - ay * R * 0.71 }, { x: cx + ax * R * 0.71, y: cy + ay * R * 0.71 }];
      const hx = -ay * d * Math.sqrt(3) / 2, hy = ax * d * Math.sqrt(3) / 2;
      geo.verts.push({ x: cx + hx, y: cy + hy }, { x: cx - hx, y: cy - hy });
      geo.edges.push([geo.verts[0], geo.verts[1]], [geo.verts[2], geo.verts[3]]);
    } else {
      const v = starVerts(cx, cy, R * 0.9, n, rot);
      const edges = starEdges(v, n, k);
      geo.verts = v; geo.edges = edges;
      const circles = [];
      for (let i = 0; i < n; i++) {
        const a = rot + i * TAU / n, rc = R * 0.45, x0 = cx + rc * Math.cos(a), y0 = cy - rc * Math.sin(a);
        const p = new Path2D(); p.arc(x0, y0, rc, 0, TAU); circles.push(p);
      }
      const edgePath = (a, b) => {
        const p = new Path2D(); p.moveTo(a.x, a.y);
        if (h > 0.6) p.lineTo(b.x, b.y);
        else { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, bow = (0.6 - h) * 0.55; p.quadraticCurveTo(mx + (mx - cx) * bow, my + (my - cy) * bow, b.x, b.y); }
        return p;
      };
      if (primary) {
        if (h < 0.6) { const chain = new Path2D(); circles.forEach(c => chain.addPath(c)); facet(chain); }
        else { const poly = new Path2D(); v.forEach((q, i) => (i ? poly.lineTo(q.x, q.y) : poly.moveTo(q.x, q.y))); poly.closePath(); facet(poly); }
      }
      // soft: circle chain through the pole (n = 6 is the seed of life), circles alternating between the two planets
      if (h < 0.6) withBlur(ctx, blur.curves, () => circles.forEach((c, i) => sg(c, AB(i), lw * (0.9 - 0.5 * h), alpha * (1 - 0.6 * h))));
      // star polygon: each edge passes from one planet's colour to the other's
      withBlur(ctx, blur.points, () => {
        edges.forEach(([a, b], i) => strokeEdge(ctx, a, b, edgePath(a, b), i % 2 ? cB : cA, i % 2 ? cA : cB, hard, lw * (0.8 + 0.5 * h), alpha, E));
        if (h > 0.6) v.forEach((q, i) => { const d = new Path2D(); d.arc(q.x, q.y, lw * 1.6, 0, TAU); sg(d, AB(i), lw, alpha); });
      });
      // spokes — rays (mercury)
      withBlur(ctx, blur.rays, () => v.forEach((q, i) => { const p = new Path2D(); p.moveTo(cx, cy); p.lineTo(q.x, q.y); sg(p, AB(i), lw * 0.4, alpha * 0.45); }));
    }
    ctx.restore();
    return geo;
  }

  /* station: the planet's own number, as hour-marks just outside the portal. pluto has no number: it bends the portal instead */
  function drawStation(ctx, state, Lt, st, R, lw, E) {
    if (!st.n) return;
    const b = state.bodies[st.planet];
    const col = st.planet === 'saturn' ? C.PLANETS.saturn.rim : C.PLANETS[st.planet].kind === 'optic' ? INK : coreColor(state, st.planet);
    const rot = eclAngle(state, b.lon);
    ctx.save();
    const p = new Path2D();
    for (let i = 0; i < st.n; i++) {
      const a = rot + i * TAU / st.n, p0 = polar(Lt, a, R * 1.09), p1 = polar(Lt, a, R * 1.16);
      p.moveTo(p0.x, p0.y); p.lineTo(p1.x, p1.y);
    }
    ctx.lineCap = 'round'; ctx.strokeStyle = K.rgba(col, 0.85); ctx.lineWidth = lw * 1.4; ctx.stroke(p);
    ctx.restore();
  }

  /* the guardians: day ruler and hour ruler as their planetary stars, point up, inside a soft light.
     one ruler: one pure figure. two: they overlap, sharing gcd(n1, n2) points. */
  const GUARD_K = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4 };
  function drawGuardians(ctx, state, Lt, E) {
    const d = state.hour.dayRuler, hr = state.hour.hourRuler;
    const cx = Lt.cx, cy = Lt.cy, rg = Lt.R * 0.095;
    const dc = C.PLANETS[d].tincture, hc = C.PLANETS[hr].tincture;
    ctx.save();
    // the light: warm white, tinted by the two guardians
    const tint = K.mixLight(K.mixLight(dc === '#040507' ? '#9aa0ab' : dc, hc === '#040507' ? '#9aa0ab' : hc, 0.5, 0), '#fff4dc', 0.6, 0);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rg * 2.6);
    g.addColorStop(0, K.rgba(tint, 0.55 * E)); g.addColorStop(0.35, K.rgba(tint, 0.18 * E)); g.addColorStop(1, K.rgba(tint, 0));
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rg * 2.6, 0, TAU); ctx.fill();
    const lw = Lt.u * 1.6;
    const star = (key, alpha) => {
      const n = C.PLANETS[key].number, k = GUARD_K[n];
      const v = starVerts(cx, cy, rg, n, Math.PI / 2);
      const p = new Path2D();
      for (let i = 0; i < n; i++) { const a = v[i], b = v[(i + k) % n]; p.moveTo(a.x, a.y); p.lineTo(b.x, b.y); }
      const c = key === 'moon' ? '#dfe6ee' : C.PLANETS[key].tincture;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(2,3,10,0.45)'; ctx.lineWidth = lw * 2.6; ctx.stroke(p);   // a dark bed so any tincture reads on any light
      strokeGlow(ctx, p, c, lw * 1.1, alpha, E, '#9aa0ab');
    };
    if (d === hr) star(d, 1);
    else { star(d, 0.9); star(hr, 0.9); }
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

  /* state ring: the planet's condition, read from the ring's form.
     colour = sign · purity = dignity · whole = domicile · doubled = exaltation · thin = minor dignity
     faint = peregrine · broken = detriment (exile) · broken and drawn in = fall */
  function stateOf(b, key) {
    const L = b.dignity.labels;
    if (L.includes('detriment')) return 'detriment';
    if (L.includes('fall')) return 'fall';
    if (L.includes('domicile')) return 'domicile';
    if (L.includes('exaltation')) return 'exaltation';
    if (L.some(l => l === 'triplicity' || l === 'term' || l === 'face')) return 'minor';
    return C.PLANETS[key].kind === 'optic' ? 'neutral' : 'peregrine';
  }
  function drawStateRing(ctx, state, Lt, key, q, coreR, lw, E, dim, t) {
    const b = state.bodies[key], P = C.PLANETS[key];
    const st = stateOf(b, key);
    let rr = coreR * (key === 'sun' ? 1.9 : key === 'moon' ? 2.0 : 2.4);
    let col = K.clarify(signColorAt(b.lon), b.clarity);
    if (b.combust) col = K.mixLight(col, '#fff1c8', 0.5, 0.04);
    let stroke = K.rgba(col, 1);
    if (key === 'neptune') stroke = '#f4f7ff';
    if (key === 'pluto') stroke = K.rgba(INK, 0.6);
    if (key === 'uranus' && ctx.createConicGradient) {
      const g = ctx.createConicGradient(t * 0.4, q.x, q.y);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, K.hueShift('#c9f0ff', i * 60));
      stroke = g;
    }
    const spec = {
      domicile: { w: 1.5, a: 0.95 }, exaltation: { w: 1.3, a: 0.95, double: true }, minor: { w: 0.9, a: 0.8 },
      peregrine: { w: 0.7, a: 0.5 }, neutral: { w: 0.8, a: 0.55 },
      detriment: { w: 1.4, a: 0.9, broken: true }, fall: { w: 1.2, a: 0.75, broken: true, inward: true }
    }[st];
    if (spec.inward) rr *= 0.9;
    withBlur(ctx, 3 * Lt.u * b.slow, () => {             // retrograde: the ring loses focus
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = spec.a * dim;
      ctx.strokeStyle = stroke; ctx.lineWidth = lw * spec.w; ctx.lineCap = 'butt';
      if (spec.broken) { const seg = TAU * rr / 12; ctx.setLineDash([seg * 0.62, seg * 0.38]); }
      ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.stroke();
      if (spec.double) { ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.arc(q.x, q.y, rr * 1.32, 0, TAU); ctx.stroke(); }
      ctx.restore();
    });
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
      const auraR = Lt.S * (key === 'sun' ? 0.05 : key === 'moon' ? 0.038 : 0.02 + 0.018 * Math.min(1, inv));
      const coreR = Lt.S * (key === 'sun' ? 0.0125 : key === 'moon' ? 0.0115 : 0.0072);

      // aura: sign colour, purity from dignity
      if (!(key === 'sun' && !up)) {
        const ac = K.clarify(aura, b.clarity);
        withBlur(ctx, 4 * Lt.u * b.slow, () => {
          ctx.save(); ctx.globalCompositeOperation = 'screen';
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, auraR);
          g.addColorStop(0, K.rgba(ac, 0.4 * E * dim)); g.addColorStop(0.4, K.rgba(ac, 0.12 * E * dim)); g.addColorStop(1, K.rgba(ac, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, auraR, 0, TAU); ctx.fill();
          ctx.restore();
        });
      }
      drawStateRing(ctx, state, Lt, key, q, coreR, lw, E, (key === 'sun' && !up) ? 0.4 : dim, t);

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
        ctx.fillStyle = '#dcebf3'; ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 0.7, 0, TAU); ctx.fill();
      } else if (key === 'neptune') {
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, coreR * 2.2);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(235,242,255,0.35)'); g.addColorStop(1, 'rgba(235,242,255,0)');
        ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 2.2, 0, TAU); ctx.fill();
      } else if (key === 'pluto') {
        // pluto has no body colour: its place is marked only by the lens drawn later
      } else {
        if (key === 'sun') {
          const g = ctx.createRadialGradient(q.x - coreR * 0.3, q.y - coreR * 0.3, 0, q.x, q.y, coreR);
          g.addColorStop(0, '#fff1c4'); g.addColorStop(0.55, core); g.addColorStop(1, K.shade(core, -0.12));
          ctx.fillStyle = g;
        } else ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(q.x, q.y, coreR, 0, TAU); ctx.fill();
      }
      if (b.cazimi) {
        ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = lw * 1.2;
        ctx.beginPath(); ctx.arc(q.x, q.y, coreR * 3.2, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      // glyph, outward of the body
      const gr = Lt.S * 0.0165, off = coreR * 2.6 + gr * 0.75;
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
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.06 * strength})`);
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
    ctx.font = `400 ${Math.round(18 * u)}px "IBM Plex Sans", sans-serif`;
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
    ctx.fillStyle = K.rgba(INK, 0.95); ctx.font = `500 ${Math.round(29 * u)}px "IBM Plex Sans", sans-serif`;
    ctx.fillText(c.l1, m, Lt.capY + 8 * u);
    ctx.fillStyle = K.rgba(INK, 0.74); ctx.font = `400 ${Math.round(26 * u)}px "IBM Plex Sans", sans-serif`;
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
    drawWeave(ctx, state, Lt, lw, E);
    // horizon
    ctx.strokeStyle = K.rgba(INK, 0.22); ctx.lineWidth = 1 * Lt.u;
    ctx.beginPath(); ctx.moveTo(Lt.cx - Lt.R, Lt.cy); ctx.lineTo(Lt.cx + Lt.R, Lt.cy); ctx.stroke();

    // the portal
    const cf = state.configs;
    const quiet = cf.primary && cf.primary.power < 0.25;
    const Rp = Lt.R * 0.5 * (cf.scale || 1) * (quiet ? 0.85 : 1);   // jupiter widens, saturn narrows
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
      // the cut: a wedge removed toward the planet that afflicts the figure
      let wedge = null;
      if (cf.cut) {
        const th = eclAngle(state, B[cf.cut.by].lon), w = cf.cut.width * Math.PI / 360;
        wedge = { th, w };
        const clip = new Path2D(); clip.rect(0, 0, S, S);
        const p0 = polar(Lt, th - w, Rp * 2), p1 = polar(Lt, th + w, Rp * 2);
        clip.moveTo(Lt.cx, Lt.cy); clip.lineTo(p0.x, p0.y); clip.lineTo(p1.x, p1.y); clip.closePath();
        ctx.save(); ctx.clip(clip, 'evenodd');
      }
      const g = drawFigure(ctx, state, Lt, cf.primary, Rp, 'primary', lw, E, t);
      if (wedge) {
        ctx.restore();
        const inWedge = q => Math.abs(E_.norm180((Math.atan2(Lt.cy - q.y, q.x - Lt.cx) - wedge.th) * 180 / Math.PI)) < wedge.w * 180 / Math.PI;
        g.verts = g.verts.filter(q => !inWedge(q));
        const ac = cf.cut.by === 'saturn' ? C.PLANETS.saturn.rim : presence(state, cf.cut.by);
        ctx.save(); ctx.strokeStyle = K.rgba(ac, 0.6); ctx.lineWidth = lw * 0.6;
        for (const sgn of [-1, 1]) { const e = polar(Lt, wedge.th + sgn * wedge.w, Rp * 1.02); ctx.beginPath(); ctx.moveTo(Lt.cx, Lt.cy); ctx.lineTo(e.x, e.y); ctx.stroke(); }
        ctx.restore();
      }
      geos.push(g);
    }
    cf.stations.forEach(st => drawStation(ctx, state, Lt, st, Rp, lw, E));
    const rippleCol = cf.ripple ? K.mixLight(C.PLANETS.moon.tincture, presence(state, cf.ripple.a === 'moon' ? cf.ripple.b : cf.ripple.a), 0.4, 0) : null;
    if (!opts.plate && rippleCol) drawRipple(ctx, Lt, Rp, rippleCol, lw, E, t);
    const stars = constellation(geos, Rp);
    drawStars(ctx, stars, Lt, E, t);

    drawBodies(ctx, state, Lt, pos, E, lw, t, involved);

    drawGuardians(ctx, state, Lt, E);

    // optics after everything inside the sky: pluto bends, neptune diffuses
    const pl = pos.pluto;
    const plStrength = (0.45 + 0.55 * Math.min(1, involved.pluto || 0)) * (B.pluto.retro ? 0.7 : 1);
    lens(ctx, pl.x, pl.y, Lt.S * 0.028, Math.min(1, plStrength));
    if (involved.pluto) lens(ctx, Lt.cx, Lt.cy, Rp * 0.3, Math.min(1, involved.pluto) * 0.6);
    if (B.pluto.station) {                                // pluto stations: the whole portal bends at its rim
      lens(ctx, Lt.cx, Lt.cy, Rp * 1.2, 0.55);
      ctx.save(); ctx.strokeStyle = K.rgba(INK, 0.14); ctx.lineWidth = Lt.u; ctx.beginPath(); ctx.arc(Lt.cx, Lt.cy, Rp * 1.2, 0, TAU); ctx.stroke(); ctx.restore();
    }
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
    ctx.font = `400 ${Math.round(18 * u)}px "IBM Plex Sans", sans-serif`; ctx.fillStyle = K.rgba(INK, 0.55);
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
