/*  cosmo weather — app shell
    Live clock, time scrubber, places, modes, export.
*/
(function (CW) {
  'use strict';
  const PLACES = {
    greenwich: { name: 'greenwich', lat: 51.4769, lon: -0.0005, tz: 'UTC', zoneLabel: 'gmt' },
    rome:      { name: 'rome',      lat: 41.9028, lon: 12.4964, tz: 'Europe/Rome' },
    jerusalem: { name: 'jerusalem', lat: 31.7683, lon: 35.2137, tz: 'Asia/Jerusalem' }
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cw.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const params = new URLSearchParams(location.search);

  const S = {
    mode: params.get('mode') || store.get('mode', 'clock'),
    place: store.get('place', PLACES.greenwich),
    live: !params.get('t'),
    offsetMs: 0,
    fixed: params.get('t') ? new Date(params.get('t')) : null,
    playing: false,
    preview: 0,                                            // minutes ahead, from the 24-hour strip
    sigil: params.get('sigil') === '1',
    field: params.get('field') || 'waves',
    state: null,
    lastCompute: 0
  };
  if (params.get('place') && PLACES[params.get('place')]) S.place = PLACES[params.get('place')];

  const $ = id => document.getElementById(id);
  const canvas = $('dial');
  const ctx = canvas.getContext('2d');
  const plate = document.createElement('canvas');          // the full render, redrawn only when the sky moves
  const pctx = plate.getContext('2d');
  let info = null, lastPlate = 0;

  function base() { return S.fixed ? new Date(S.fixed.getTime() + S.offsetMs) : new Date(Date.now() + S.offsetMs); }
  function now() { return new Date(base().getTime() + S.preview * 60000); }

  function recompute() {
    S.state = CW.engine.compute(now(), S.place);
    if (!S.playing) S.state.nextChord = CW.engine.nextChordShift(S.state.date, S.place);
    S.lastCompute = performance.now();
    S.dirty = true;
    document.documentElement.style.setProperty('--ground', CW.render.ground(S.state));
    const c = CW.render.captionLines(S.state);
    $('caption').innerHTML = `<p class="l1">${c.l1}</p><p>${c.l2}</p><p>${c.l3}</p><p>${c.chord}</p><p class="mono">${c.next}</p><p class="mono">${c.fig}</p><p class="mono">${c.moon}</p>`;
    scanIfNeeded();
    drawStrip();
    updateReadout();
    updateControls();
  }

  function size() {
    const box = $('stage').getBoundingClientRect();
    const small = box.width < 560;
    const reserve = small ? 0 : 110;                        // room for the 24-hour strip under the dial
    const side = Math.floor(Math.min(box.width - 16, small ? box.width : box.height - reserve - 16));
    $('ahead').style.width = side + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = side + 'px';
    canvas.width = canvas.height = Math.round(side * dpr);
    S.side = side; S.dpr = dpr;
    plate.width = plate.height = canvas.width;
    S.dirty = true;
    document.body.classList.toggle('small', side < 560);
    const st = $('strip'); st.width = Math.round(side * dpr); st.height = Math.round(34 * dpr);
    drawStrip();
  }

  /* ---------- the next 24 hours: ideation (aleph), incarnation (mem), destruction (shin) ---------- */
  const MOTHER_INK = { ideation: '#f2e8a0', incarnation: '#4a7ef0', destruction: '#ff5a2a' };   // king scale of the mother letters
  const scan = { key: null, t0: 0, step: 20, vals: null, nexts: null, token: 0 };
  function scanIfNeeded() {
    const b = base().getTime();
    const key = S.place.name + S.place.lat + S.place.lon;
    if (scan.key === key && Math.abs(b - scan.t0) < 30 * 60000) return;
    scan.key = key; scan.t0 = b; scan.vals = null; scan.nexts = null;
    const token = ++scan.token, N = 7 * 72, out = [];
    let i = 0;
    (function chunk() {
      if (token !== scan.token) return;
      for (let k = 0; k < 24 && i <= N; k++, i++) {
        const st = CW.engine.compute(new Date(b + i * scan.step * 60000), S.place, { light: true });
        out.push(st.windows);
      }
      if (i <= N) return setTimeout(chunk, 0);
      scan.vals = out;
      scan.nexts = {};
      for (const m of Object.keys(MOTHER_INK)) {
        const v = out.map(w => w[m]), sorted = v.slice().sort((x, y) => x - y);
        const T = Math.max(0.12, sorted[Math.floor(sorted.length * 0.85)]);
        let j = v.findIndex((x, n) => n > 0 && x >= T);
        if (j > 0) { while (j + 1 < v.length && v[j + 1] >= v[j]) j++; scan.nexts[m] = { at: new Date(b + j * scan.step * 60000), v: v[j] }; }
      }
      drawStrip(); drawNexts();
    })();
  }
  function drawStrip() {
    const cv = $('strip'); if (!cv || !cv.width) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, d = S.dpr || 1;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(235,231,220,0.18)'; c.lineWidth = d;
    c.beginPath(); c.moveTo(0, H - 0.5 * d); c.lineTo(W, H - 0.5 * d); c.stroke();
    for (let h = 0; h <= 24; h += 6) { const x = Math.min(W - d, h / 24 * W); c.beginPath(); c.moveTo(x, H); c.lineTo(x, H - 5 * d); c.stroke(); }
    if (scan.vals) {
      const n = 72, vals = scan.vals.slice(0, n + 1);
      const peak = Math.max(0.2, ...vals.flatMap(w => Object.values(w)));
      for (const [m, col] of Object.entries(MOTHER_INK)) {
        c.strokeStyle = col; c.lineWidth = 1.6 * d; c.globalAlpha = 0.9;
        c.beginPath();
        vals.forEach((w, i) => { const x = i / n * W, y = H - 2 * d - (w[m] / peak) * (H - 6 * d); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    const x = S.preview / 1440 * W;
    c.fillStyle = 'rgba(235,231,220,0.9)'; c.fillRect(Math.min(W - 2 * d, x), 0, 2 * d, H);
  }
  function fmtAt(d) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: S.place.tz || 'UTC' }).format(d).toLowerCase();
  }
  function drawNexts() {
    const el = $('nexts');
    if (!scan.nexts) { el.innerHTML = '<span>reading the next seven days…</span>'; return; }
    el.innerHTML = Object.entries(MOTHER_INK).map(([m, col]) => {
      const n = scan.nexts[m];
      return n ? `<button data-jump="${n.at.toISOString()}" title="go to this moment"><i style="background:${col}"></i>${m} · ${fmtAt(n.at)}</button>`
               : `<span><i style="background:${col}"></i>${m} · not this week</span>`;
    }).join('');
    el.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { S.fixed = new Date(b.dataset.jump); S.offsetMs = 0; S.preview = 0; $('preview').value = 0; recompute(); }));
  }

  let t0 = performance.now(), lastFrame = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastFrame < 1000 / 24) return;                   // 24 fps is enough for a clock
    lastFrame = ts;
    if (S.playing) { S.offsetMs += 3600e3 / 24; recompute(); }  // one hour per second
    else if (performance.now() - S.lastCompute > 20000) recompute();
    const t = (ts - t0) / 1000;
    if (S.dirty && (!S.playing || ts - lastPlate > 140)) {
      pctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      info = CW.render.render(pctx, S.state, S.side, t, { mode: S.mode, fieldRes: S.playing ? 110 : 200, caption: S.side >= 560, plate: true, fast: S.playing, field: S.field, sigil: S.sigil });
      S.dirty = false; lastPlate = ts;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(plate, 0, 0);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    CW.render.overlay(ctx, info, t);
  }

  /* ---------- export: square art ---------- */
  function exportPNG(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d');
    CW.render.render(c, S.state, px, (performance.now() - t0) / 1000, { mode: S.mode, fieldRes: px >= 3000 ? 420 : 300, field: S.field, sigil: S.sigil });
    const d = S.state.date;
    const stamp = d.toISOString().slice(0, 16).replace(/[:T]/g, '');
    cv.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `cosmo-weather_${S.place.name}_${stamp}_${px}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  /* ---------- readout: every mark traceable ---------- */
  function updateReadout() {
    const st = S.state, C = CW.corr;
    const rows = C.ORDER.map(k => {
      const b = st.bodies[k];
      const flags = [b.retro ? 'rx' : '', b.station ? 'stn' : '', b.combust ? 'comb' : '', b.cazimi ? 'caz' : ''].filter(Boolean).join(' ');
      return `<tr><td>${k}</td><td>${Math.floor(b.deg)}°${String(Math.floor((b.deg % 1) * 60)).padStart(2, '0')}′ ${C.SIGNS[b.sign].name.slice(0, 3)}</td><td>h${b.house}</td><td>${b.dignity.score > 0 ? '+' : ''}${b.dignity.score} ${b.dignity.labels.map(l => l.slice(0, 4)).join(' ')}</td><td>${flags}</td></tr>`;
    }).join('');
    const cf = st.configs;
    const figs = [cf.primary, ...cf.secondary].filter(Boolean).map((a, i) =>
      `<tr><td>${i ? 'ring' : 'figure'}</td><td>${a.a} ${a.aspect} ${a.b}</td><td>{${a.n}/${a.k}}</td><td>orb ${a.orb.toFixed(2)}° ${a.applying ? 'applying' : 'separating'}</td><td>${a.power.toFixed(2)}${a.event ? ' · ' + a.event : ''}</td></tr>`).join('');
    const top = st.aspects.slice(0, 12).map(a =>
      `<tr><td>${a.a} ${a.aspect} ${a.b}</td><td>${a.orb.toFixed(2)}°</td><td>${a.applying ? 'app' : 'sep'}</td><td>${a.power.toFixed(3)}</td></tr>`).join('');
    const ev = st.events.map(e => e.type + (e.planet ? ' ' + e.planet : '') + (e.kind ? ' ' + e.kind : '') + (e.direction ? ' ' + e.direction : '')).join(' · ') || '—';
    $('readout').innerHTML = `
      <h3>bodies</h3><table>${rows}</table>
      <h3>the figure</h3><table>${figs || '<tr><td>quiet sky</td></tr>'}</table>
      <h3>portal</h3><p>scale ×${(cf.scale || 1).toFixed(2)} (jupiter widens, saturn narrows)${cf.cut ? ` · cut by ${cf.cut.by} ${cf.cut.aspect} ${cf.cut.target}, ${Math.round(cf.cut.width)}°` : ' · whole'}</p>
      <p>guardians ${st.hour.dayRuler}${st.hour.dayRuler === st.hour.hourRuler ? ' alone: one pure figure' : ' and ' + st.hour.hourRuler}</p>
      <h3>sound</h3><p>${st.nextChord ? `next shift ${st.nextChord.from} → ${st.nextChord.to} at ${st.nextChord.at.toISOString().slice(0, 16).replace('T', ' ')} utc · ` : ''}${st.chord.name}${st.chord.notes.length ? ' · ' + st.chord.notes.join(' ') : ''}${st.chord.planets ? ' · from ' + st.chord.planets.join(', ') : ''}</p>
      <h3>windows</h3><p>ideation ${st.windows.ideation.toFixed(2)} · incarnation ${st.windows.incarnation.toFixed(2)} · destruction ${st.windows.destruction.toFixed(2)}</p>
      <h3>moon</h3><p>${st.moon.verdict} · ${st.moon.next ? `next ${st.moon.next.aspect} ${st.moon.next.planet} in ${(st.moon.next.days * 24).toFixed(1)}h` : 'void of course'}${st.moon.flags.filter(f => f !== 'void of course').map(f => ' · ' + f).join('')}</p>
      <h3>events</h3><p>${ev}</p>
      <h3>hierarchy</h3><table>${top}</table>
      <p class="dim">sect ${st.sect} · asc ${Math.floor(st.asc % 30)}° ${C.SIGNS[Math.floor(st.asc / 30)].name} · mc ${Math.floor(st.mc % 30)}° ${C.SIGNS[Math.floor(st.mc / 30)].name} · day ${st.hour.dayRuler} / ${st.hour.dayAngel} · hour ${st.hour.index + 1} ${st.hour.hourRuler} / ${st.hour.angel}</p>`;
  }

  function updateControls() {
    const d = S.state.date;
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    if (document.activeElement !== $('when')) $('when').value = local;
    $('live').classList.toggle('on', S.offsetMs === 0 && !S.fixed && !S.playing);
    $('play').classList.toggle('on', S.playing);
    document.querySelectorAll('[data-place]').forEach(b => b.classList.toggle('on', b.dataset.place === S.place.name));
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    $('sigil').classList.toggle('on', S.sigil);
  }

  function bind() {
    document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { S.offsetMs += Number(b.dataset.step) * 3600e3; recompute(); }));
    $('live').addEventListener('click', () => { S.offsetMs = 0; S.fixed = null; S.playing = false; S.preview = 0; $('preview').value = 0; recompute(); });
    $('play').addEventListener('click', () => { S.playing = !S.playing; updateControls(); });
    $('when').addEventListener('change', e => {
      const v = new Date(e.target.value);
      if (!isNaN(v)) { S.fixed = v; S.offsetMs = 0; recompute(); }
    });
    document.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.place;
      if (k === 'here') {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(p => {
          S.place = { name: 'here', lat: p.coords.latitude, lon: p.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
          store.set('place', S.place); recompute();
        }, () => {}, { timeout: 10000 });
        return;
      }
      S.place = PLACES[k]; store.set('place', S.place); recompute();
    }));
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { S.mode = b.dataset.mode; store.set('mode', S.mode); S.dirty = true; updateControls(); }));
    $('save').addEventListener('click', () => exportPNG(2048));
    $('sigil').addEventListener('click', () => { S.sigil = !S.sigil; S.dirty = true; updateControls(); });
    $('preview').addEventListener('input', e => { S.preview = Number(e.target.value); recompute(); });
    $('save-hd').addEventListener('click', () => exportPNG(4096));
    $('info').addEventListener('click', () => document.body.classList.toggle('reading'));
    $('full').addEventListener('click', () => {
      document.body.classList.toggle('bare');
      if (document.body.classList.contains('bare') && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen();
    });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'f') $('full').click();
      if (e.key === 'i') $('info').click();
      if (e.key === 's') $('sigil').click();
      if (e.key === ' ') { e.preventDefault(); $('play').click(); }
      if (e.key === 'ArrowRight') { S.offsetMs += (e.shiftKey ? 24 : 1) * 3600e3; recompute(); }
      if (e.key === 'ArrowLeft') { S.offsetMs -= (e.shiftKey ? 24 : 1) * 3600e3; recompute(); }
      if (e.key === 'Escape') document.body.classList.remove('bare', 'reading');
    });
    window.addEventListener('resize', size);
    if (params.get('hd') !== '1') $('save-hd').hidden = true;
  }

  async function start() {
    try {
      await Promise.all(['500 20px Jost', '400 20px "IBM Plex Sans"', '500 20px "IBM Plex Sans"', '400 20px "IBM Plex Mono"'].map(f => document.fonts.load(f)));
    } catch (e) { /* fonts are a nicety */ }
    bind(); size(); recompute(); drawNexts();
    requestAnimationFrame(frame);
  }
  CW.app = { start, exportPNG, S };
  start();
})(window.CW = window.CW || {});
