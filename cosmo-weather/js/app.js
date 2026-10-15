/*  cosmo weather — app shell
    Live clock, time scrubber, places, modes, export.
*/
(function (CW) {
  'use strict';
  /* one city for each time zone, west to east */
  const ZONES = [
    ['pago pago', -14.2756, -170.7020, 'Pacific/Pago_Pago'], ['honolulu', 21.3069, -157.8583, 'Pacific/Honolulu'],
    ['atuona', -9.8030, -139.0410, 'Pacific/Marquesas'], ['anchorage', 61.2181, -149.9003, 'America/Anchorage'],
    ['los angeles', 34.0522, -118.2437, 'America/Los_Angeles'], ['denver', 39.7392, -104.9903, 'America/Denver'],
    ['mexico city', 19.4326, -99.1332, 'America/Mexico_City'], ['new york', 40.7128, -74.0060, 'America/New_York'],
    ['caracas', 10.4806, -66.9036, 'America/Caracas'], ["st. john's", 47.5615, -52.7126, 'America/St_Johns'],
    ['são paulo', -23.5505, -46.6333, 'America/Sao_Paulo'], ['noronha', -3.8540, -32.4240, 'America/Noronha'],
    ['ponta delgada', 37.7412, -25.6756, 'Atlantic/Azores'], ['greenwich', 51.4769, -0.0005, 'UTC', 'gmt'],
    ['rome', 41.9028, 12.4964, 'Europe/Rome'], ['jerusalem', 31.7683, 35.2137, 'Asia/Jerusalem'],
    ['istanbul', 41.0082, 28.9784, 'Europe/Istanbul'], ['tehran', 35.6892, 51.3890, 'Asia/Tehran'],
    ['dubai', 25.2048, 55.2708, 'Asia/Dubai'], ['kabul', 34.5553, 69.2075, 'Asia/Kabul'],
    ['karachi', 24.8607, 67.0011, 'Asia/Karachi'], ['mumbai', 19.0760, 72.8777, 'Asia/Kolkata'],
    ['kathmandu', 27.7172, 85.3240, 'Asia/Kathmandu'], ['dhaka', 23.8103, 90.4125, 'Asia/Dhaka'],
    ['yangon', 16.8409, 96.1735, 'Asia/Yangon'], ['bangkok', 13.7563, 100.5018, 'Asia/Bangkok'],
    ['beijing', 39.9042, 116.4074, 'Asia/Shanghai'], ['tokyo', 35.6762, 139.6503, 'Asia/Tokyo'],
    ['darwin', -12.4634, 130.8456, 'Australia/Darwin'], ['sydney', -33.8688, 151.2093, 'Australia/Sydney'],
    ['nouméa', -22.2758, 166.4580, 'Pacific/Noumea'], ['auckland', -36.8485, 174.7633, 'Pacific/Auckland'],
    ["nuku'alofa", -21.1394, -175.2018, 'Pacific/Tongatapu'], ['kiritimati', 1.8721, -157.3626, 'Pacific/Kiritimati']
  ].map(([name, lat, lon, tz, zoneLabel]) => ({ name, lat, lon, tz, zoneLabel }));
  const PLACES = Object.fromEntries(ZONES.map(z => [z.name, z]));
  const offsetOf = (tz, d = new Date()) => {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(d).find(p => p.type === 'timeZoneName').value.replace('GMT', 'utc').toLowerCase() || 'utc'; }
    catch (e) { return ''; }
  };
  /* without a stored place: the city of the device's own time zone, then the device's position if allowed */
  function placeFromDevice() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const exact = ZONES.find(z => z.tz === tz);
    if (exact) return exact;
    const off = offsetOf(tz);
    return ZONES.find(z => offsetOf(z.tz) === off) || PLACES.greenwich;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cw.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const params = new URLSearchParams(location.search);

  const S = {
    mode: params.get('mode') || store.get('mode', 'clock'),
    place: store.get('place', null) || placeFromDevice(),
    firstVisit: !store.get('place', null),
    speed: 1,                                              // hours of sky per second while running
    live: !params.get('t'),
    offsetMs: 0,
    fixed: params.get('t') ? new Date(params.get('t')) : null,
    playing: false,
    preview: 0,                                            // minutes ahead, from the 24-hour strip
    sigil: params.get('sigil') === '1',
    engrave: params.get('field') !== 'glow' && params.get('engrave') !== '0',   // engraved at rest; glow only on request
    natal: store.get('natal', null),                        // { date, place, unknownTime } — stays on this device
    lang: params.get('lang') || store.get('lang', null) || ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'),
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
  const view = { z: 1, x: 0, y: 0, pinching: false };      // screen = view.xy + view.z × dial

  function base() { return S.fixed ? new Date(S.fixed.getTime() + S.offsetMs) : new Date(Date.now() + S.offsetMs); }
  function now() { return new Date(base().getTime() + S.preview * 60000); }

  /* the nativity, computed once per birth data */
  const natalCache = { key: null, state: null };
  function natalState() {
    if (!S.natal) return null;
    const key = JSON.stringify(S.natal);
    if (natalCache.key !== key) {
      const st = CW.engine.compute(new Date(S.natal.date), S.natal.place);
      st.natalView = true; st.nextChord = null;
      natalCache.key = key; natalCache.state = st;
    }
    return natalCache.state;
  }
  const natalModes = ['natal', 'natalchart', 'synastry'];
  function viewState() { return (S.mode === 'natal' || S.mode === 'natalchart') && S.natal ? natalState() : S.state; }

  function recompute() {
    const busy = S.playing || S.dragging;
    S.state = CW.engine.compute(now(), S.place, { light: busy });
    if (!busy) S.state.nextChord = CW.engine.nextChordShift(S.state.date, S.place);
    if (S.mode === 'synastry' && S.natal) {                 // the sky of now against the nativity: the figure is the strongest transit
      const ns = natalState(), tr = CW.engine.computeTransits(S.state, ns).filter(x => x.power > 0.04);
      S.state.natal = ns; S.state.transits = tr;
      S.state.configs = { ...S.state.configs, primary: tr[0] || null, secondary: tr.slice(1, 3), scale: 1, cut: null };
    }
    S.lastCompute = performance.now();
    S.dirty = true;
    document.documentElement.style.setProperty('--ground', CW.render.ground(S.state));
    const c = CW.render.captionLines(viewState());
    $('caption').innerHTML = `<p class="l1">${c.l1}</p><p>${c.l2}</p><p>${c.l3}</p><p>${c.chord}</p><p>${c.decan}</p><p class="mono">${c.next}</p><p class="mono">${c.fig}</p><p class="mono">${c.moon}</p><p class="mono">${c.mansion}</p>`;
    if (!busy) scanIfNeeded();
    drawStrip();
    if (!busy) updateReadout();                            // the heavy parts wait until the clock rests
    followChord();
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
    const st = $('strip'); st.width = Math.round(side * dpr); st.height = Math.round(44 * dpr);
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
      const top = 14 * d;                                     // room for the hour labels
      for (const [m, col] of Object.entries(MOTHER_INK)) {
        c.strokeStyle = col; c.lineWidth = 1.6 * d; c.globalAlpha = 0.9;
        c.beginPath();
        vals.forEach((w, i) => { const x = i / n * W, y = H - 2 * d - (w[m] / peak) * (H - 4 * d - top); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    c.font = `${10 * d}px "Geist Mono", monospace`; c.fillStyle = 'rgba(235,231,220,0.5)'; c.textBaseline = 'top';
    CW.i18n.t('ui.strip').map((l, n) => [l, n * 6]).forEach(([l, h]) => { c.textAlign = h === 0 ? 'left' : h === 24 ? 'right' : 'center'; c.fillText(l, h / 24 * W, 2 * d); });
    const x = S.preview / 1440 * W;
    c.fillStyle = 'rgba(235,231,220,0.9)'; c.fillRect(Math.min(W - 2 * d, x), 0, 2 * d, H);
  }
  function fmtAt(d) {
    return new Intl.DateTimeFormat(CW.i18n.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: S.place.tz || 'UTC' }).format(d).toLowerCase();
  }
  function drawNexts() {
    const el = $('nexts');
    const i = CW.i18n;
    if (!scan.nexts) { el.innerHTML = `<span>${i.t('ui.reading')}</span>`; return; }
    el.innerHTML = Object.entries(MOTHER_INK).map(([m, col]) => {
      const n = scan.nexts[m];
      return n ? `<button data-jump="${n.at.toISOString()}" title="${i.t('ui.goTo')}"><i style="background:${col}"></i>${i.window(m)} · ${fmtAt(n.at)}</button>`
               : `<span><i style="background:${col}"></i>${i.window(m)} · ${i.t('ui.notThisWeek')}</span>`;
    }).join('');
    el.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { S.playing = false; S.fixed = new Date(b.dataset.jump); S.offsetMs = 0; S.preview = 0; $('preview').value = 0; recompute(); }));
  }

  let t0 = performance.now(), lastFrame = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!S.playing && !S.dragging && ts - lastFrame < 1000 / 30) return;     // at rest 30 fps; running, every frame the screen gives
    const dt = Math.min(0.1, (ts - (lastFrame || ts)) / 1000);
    if (S.playing) { S.offsetMs += S.speed * 3600e3 * dt; recompute(); }   // smooth: time advances with the real frame interval
    else if (performance.now() - S.lastCompute > 20000) recompute();
    lastFrame = ts;
    const t = (ts - t0) / 1000;
    if (S.dirty) {
      pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, plate.width, plate.height);
      pctx.setTransform(S.dpr * view.z, 0, 0, S.dpr * view.z, S.dpr * view.x, S.dpr * view.y);   // the view: zoom and pan
      const busy = S.playing || S.dragging || view.pinching;
      info = CW.render.render(pctx, viewState(), S.side, t, { mode: S.mode === 'chart' || S.mode === 'natalchart' ? 'chart' : 'clock', fieldRes: busy ? 110 : 200, caption: S.side >= 560, plate: true, fast: busy, field: S.field, sigil: S.sigil, engrave: S.engrave });
      S.dirty = false; lastPlate = ts;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(plate, 0, 0);
    ctx.setTransform(S.dpr * view.z, 0, 0, S.dpr * view.z, S.dpr * view.x, S.dpr * view.y);
    CW.render.overlay(ctx, info, t);
  }

  /* ---------- sound: the chord as a slow organ drone ----------
     Pure tones with their first overtones (the organ pipe; Pythagoras' and Kepler's music of the spheres),
     each doubled with a slight detune so it breathes. A = 440. The root also sounds an octave below.
     Swells in over 3 s, glides to the next chord when the sky shifts, fades over 3 s on stop. */
  const audio = { ctx: null, bus: null, voices: [], key: null, on: false };
  function reverb(ac) {
    const len = ac.sampleRate * 3.2, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const c = ac.createConvolver(); c.buffer = buf; return c;
  }
  function voicing(ch) {
    if (!ch || !ch.pcs || !ch.pcs.length) return [];
    const freq = (pc, oct) => 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4));
    const root = ch.root, out = [{ f: freq(root, 2), g: 0.5 }, { f: freq(root, 3), g: 1 }];
    for (const pc of ch.pcs) if (pc !== root) out.push({ f: freq(pc, pc > root ? 3 : 4), g: 0.8 });
    return out;
  }
  function soundChord(ch, fadeIn = 3) {
    const ac = audio.ctx, now = ac.currentTime;
    for (const v of audio.voices) { v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(v.gain.gain.value, now); v.gain.gain.linearRampToValueAtTime(0, now + 3); v.oscs.forEach(o => o.stop(now + 3.1)); }
    audio.voices = [];
    for (const { f, g } of voicing(ch)) {
      const gain = ac.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.11 * g, now + fadeIn);
      gain.connect(audio.bus);
      const oscs = [];
      for (const [mult, amp] of [[1, 1], [2, 0.32], [3, 0.14], [4, 0.06]]) for (const det of [-0.12, 0.12]) {
        const o = ac.createOscillator(), a = ac.createGain();
        o.type = 'sine'; o.frequency.value = f * mult + det * mult; a.gain.value = amp / 2;
        o.connect(a).connect(gain); o.start(now); oscs.push(o);
      }
      audio.voices.push({ gain, oscs });
    }
    audio.key = ch ? ch.name : null;
  }
  function listen(on) {
    if (on && !audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const ac = audio.ctx = new Ctx();
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const master = ac.createGain(); master.gain.value = 0.9;
      const wet = ac.createGain(); wet.gain.value = 0.55; const rv = reverb(ac);
      audio.bus = lp; lp.connect(master); lp.connect(rv).connect(wet).connect(master); master.connect(ac.destination);
    }
    audio.on = on;
    if (!audio.ctx) return;
    if (on) { audio.ctx.resume(); soundChord(S.state.chord); }
    else soundChord(null);
    $('listen').classList.toggle('on', on);
    $('listen').textContent = CW.i18n.t(on ? 'ui.listening' : 'ui.listen');
  }
  function followChord() { if (audio.on && S.state && S.state.chord.name !== audio.key) soundChord(S.state.chord, 2.5); }

  /* ---------- export: square art ---------- */
  function download(cv, name) {
    cv.toBlob(async b => {
      try {                                                   // inside the claude.ai viewer a file is handed over through its downloads capability
        const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
        if (dl) { await dl.save({ filename: name, data: b }); return; }
      } catch (e) { if (e && e.code === 'declined') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }
  const stampOf = st => st.date.toISOString().slice(0, 16).replace(/[:T]/g, '');
  function exportPNG(px) {
    const st = viewState(), cv = document.createElement('canvas');
    cv.width = cv.height = px;
    CW.render.render(cv.getContext('2d'), st, px, (performance.now() - t0) / 1000, { mode: S.mode === 'chart' || S.mode === 'natalchart' ? 'chart' : 'clock', fieldRes: px >= 3000 ? 420 : 300, field: S.field, sigil: S.sigil, engrave: S.engrave });
    download(cv, `cosmo-weather_${st.loc.name}_${stampOf(st)}_${px}.png`);
  }
  /* a wallpaper at this screen's size: the square render set in a portrait field of the same ground */
  function exportWallpaper() {
    const st = viewState(), dpr = window.devicePixelRatio || 1;
    const W = Math.round((screen.width || 1080) * dpr), H = Math.round((screen.height || 2340) * dpr);
    const side = Math.min(W, H), cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = CW.render.ground(st); c.fillRect(0, 0, W, H);
    const sq = document.createElement('canvas'); sq.width = sq.height = side;
    CW.render.render(sq.getContext('2d'), st, side, 3, { mode: 'clock', fieldRes: 300, sigil: S.sigil, engrave: S.engrave });
    c.drawImage(sq, (W - side) / 2, (H - side) / 2);
    download(cv, `cosmo-weather_wallpaper_${st.loc.name}_${stampOf(st)}.png`);
  }

  const ordinalWord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  /* ---------- readout: every mark traceable ---------- */
  function updateReadout() {
    const st = viewState(), C = CW.corr, i = CW.i18n, R = k => i.t('ui.r.' + k), H = k => i.t('ui.h.' + k);
    const P = k => i.planet(k), A = k => i.aspect(k);
    const rows = C.ORDER.map(k => {
      const b = st.bodies[k];
      const flags = [b.retro ? i.flag('retrograde') : '', b.station ? i.flag('stationary') : '', b.cazimi ? i.flag('cazimi') : b.combust ? i.flag('combust') : b.beams ? i.flag('beams') : ''].filter(Boolean).join(', ');
      const dig = C.PLANETS[k].kind === 'optic' ? i.flag('noDignity') : `${b.dignity.score > 0 ? '+' : ''}${b.dignity.score} · ${b.dignity.labels.map(l => i.dignity(l)).join(', ') || '—'}`;
      return `<tr><td>${P(k)}</td><td>${Math.floor(b.deg)}°${String(Math.floor((b.deg % 1) * 60)).padStart(2, '0')}′ ${i.sign(b.sign)}</td><td>${R('house')} ${b.house}</td></tr><tr class="sub"><td></td><td colspan="2">${dig}${flags ? ' · ' + flags : ''}</td></tr>`;
    }).join('');
    const cf = st.configs;
    const figName = a => a.natal ? `${P(a.a)} ${A(a.aspect)} ${i.t('cap.natal')} ${P(a.b)}` : `${P(a.a)} ${A(a.aspect)} ${P(a.b)}`;
    const evName = e => e.split(' ').map(w => i.event(w)).join(' ');
    const figs = [cf.primary, ...cf.secondary].filter(Boolean).map((a, n) =>
      `<tr><td>${n ? R('ring') : R('figure')}</td><td>${figName(a)}</td><td>{${a.n}/${a.k}}</td><td>${R('orb')} ${a.orb.toFixed(2)}° ${a.applying ? R('applying') : R('separating')}${a.dissociate ? ' · ' + i.flag('outOfSign') : ''}</td><td>${a.power.toFixed(2)}${a.event ? ' · ' + evName(a.event) : ''}</td></tr>`).join('');
    const tz = st.loc.tz || 'UTC';
    const hm = d => new Intl.DateTimeFormat(i.locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d);
    const dec = b => `${i.decanOrd(b.decan.decan)} ${i.t('cap.decanOf')} ${i.sign(b.sign)} · ${P(b.decan.ruler)}`;
    const tarot = `<table>
      <tr><td>${R('sun')}</td><td>${dec(st.bodies.sun)}</td><td>${i.card(st.bodies.sun.decan)} · ${i.title(st.bodies.sun.decan)}</td></tr>
      <tr><td>${R('moon')}</td><td>${dec(st.bodies.moon)}</td><td>${i.card(st.bodies.moon.decan)} · ${i.title(st.bodies.moon.decan)}</td></tr>
      <tr><td>${R('ascendant')}</td><td>${i.sign(Math.floor(st.asc / 30))}</td><td>${i.trumpSign(Math.floor(st.asc / 30))}</td></tr>
      <tr><td>${R('dayRuler')}</td><td>${P(st.hour.dayRuler)}</td><td>${i.trumpPlanet(st.hour.dayRuler)}</td></tr>
      <tr><td>${R('hourRuler')}</td><td>${P(st.hour.hourRuler)}</td><td>${i.trumpPlanet(st.hour.hourRuler)}</td></tr></table>`;
    const hours = st.hour.table ? st.hour.table.map(h => `<span${h.index === st.hour.index ? ' class="now"' : ''}>${h.index + 1} ${P(h.ruler)} ${hm(h.start)}</span>`).join(' · ') : i.t('ui.polar');
    const top = st.aspects.slice(0, 12).map(a =>
      `<tr><td>${figName(a)}</td><td>${a.orb.toFixed(2)}°</td><td>${a.applying ? R('applying') : R('separating')}</td><td>${a.power.toFixed(3)}</td></tr>`).join('');
    const ev = st.events.map(e => i.event(e.type) + (e.planet ? ' ' + P(e.planet) : '') + (e.kind ? ' ' + evName(e.kind) : '') + (e.direction ? ' ' + i.event(e.direction) : '')).join(' · ') || '—';
    const W = k => `${i.window(k)} ${st.windows[k].toFixed(2)}`;
    $('readout').innerHTML = `
      <h3>${H('bodies')}</h3><table>${rows}</table>
      <h3>${H('figure')}</h3><table>${figs || `<tr><td>${i.t('ui.quietSky')}</td></tr>`}</table>
      <h3>${H('sound')}</h3><p>${st.chord.name}${st.chord.interval ? ' · ' + i.interval(st.chord.interval) : ''}${st.chord.notes.length ? ` · ${R('notes')} ` + st.chord.notes.join(' ') : ''}${st.chord.planets ? ` · ${R('from')} ` + st.chord.planets.map(P).join(', ') : ''}${st.nextChord ? ` · ${R('next')} ${st.nextChord.to} ${R('at')} ${hm(st.nextChord.at)}` : ''}</p>
      <h3>${H('tarot')}</h3>${tarot}
      ${st.transits ? `<h3>${H('transits')}</h3><table>${st.transits.slice(0, 8).map(a => `<tr><td>${figName(a)}</td><td>${a.orb.toFixed(2)}°</td><td>${a.applying ? R('applying') : R('separating')}</td><td>${a.power.toFixed(2)}</td></tr>`).join('') || `<tr><td>${i.t('ui.noContact')}</td></tr>`}</table>` : ''}
      <h3>${H('portal')}</h3><p>${R('scale')} ×${(cf.scale || 1).toFixed(2)} (${R('widens')})${cf.cut ? ` · ${R('cut')} ${P(cf.cut.by)} ${A(cf.cut.aspect)} ${P(cf.cut.target)}, ${Math.round(cf.cut.width)}°` : ' · ' + R('whole')}</p>
      <p>${R('guardians')} ${P(st.hour.dayRuler)}${st.hour.dayRuler === st.hour.hourRuler ? ' ' + R('alone') : ' ' + R('and') + ' ' + P(st.hour.hourRuler)}</p>
      <h3>${H('windows')}</h3><p>${W('ideation')} · ${W('incarnation')} · ${W('destruction')}</p>
      <h3>${H('moon')}</h3><p>${i.verdict(st.moon.verdict)} · ${st.moon.next ? `${R('nextMoon')} ${A(st.moon.next.aspect)} ${P(st.moon.next.planet)} ${R('in')} ${(st.moon.next.days * 24).toFixed(1)}h` : i.flag('void of course')}${st.moon.flags.filter(f => f !== 'void of course').map(f => ' · ' + i.flag(f === 'under the beams' ? 'beams' : f)).join('')}</p>
      <p>${i.ordinal(st.bodies.moon.mansion.index)} ${R('mansion')} · ${st.bodies.moon.mansion.name} (agrippa II.33)</p>
      <h3>${H('hours')}</h3><p class="hours">${hours}</p>
      <h3>${H('events')}</h3><p>${ev}</p>
      <h3>${H('hierarchy')}</h3><table>${top}</table>
      <p class="dim">${R('sect')} ${st.sect === 'day' ? R('day') : R('night')} · asc ${Math.floor(st.asc % 30)}° ${i.sign(Math.floor(st.asc / 30))} · mc ${Math.floor(st.mc % 30)}° ${i.sign(Math.floor(st.mc / 30))} · ${R('dayRuler')} ${P(st.hour.dayRuler)} / ${st.hour.dayAngel} · ${R('hour')} ${st.hour.index + 1} ${P(st.hour.hourRuler)} / ${st.hour.angel}</p>`;
  }

  function updateControls() {
    if (document.activeElement !== $('when')) $('when').value = placeStamp(S.state.date);
    $('zone').textContent = offsetOf(S.place.tz || 'UTC', S.state.date);
    $('live').classList.toggle('on', S.offsetMs === 0 && !S.fixed && !S.playing);
    $('play').classList.toggle('on', S.playing);
    $('play').textContent = CW.i18n.t(S.playing ? 'ui.pause' : 'ui.run');
    $('speed').textContent = S.speed < 1 ? `${S.speed * 60}m/s` : `${S.speed}h/s`;
    $('here').classList.toggle('on', S.place.name === 'here');
    if (PLACES[S.place.name] && $('city').value !== S.place.name) $('city').value = S.place.name;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode || (S.mode === 'natalchart' && (b.dataset.mode === 'chart' || b.dataset.mode === 'natal'))));
    document.body.classList.toggle('natal', S.mode === 'natal' || S.mode === 'natalchart');
    $('sigil').classList.toggle('on', S.sigil);
  }

  function bind() {
    document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { S.offsetMs += Number(b.dataset.step) * 3600e3; recompute(); }));
    $('live').addEventListener('click', () => { S.offsetMs = 0; S.fixed = null; S.playing = false; S.preview = 0; $('preview').value = 0; recompute(); });
    $('play').addEventListener('click', () => {
      S.playing = !S.playing;
      if (!S.playing) recompute(); else updateControls();  // on pause, the full reading of the moment where it stopped
    });
    const SPEEDS = [0.25, 1, 4, 24];
    $('speed').addEventListener('click', () => { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; updateControls(); });
    const fill = () => { $('city').innerHTML = ZONES.map(z => `<option value="${z.name}">${offsetOf(z.tz)} · ${z.name}</option>`).join('') + (PLACES[S.place.name] ? '' : `<option value="" selected>${S.place.name}</option>`); };
    fill();
    $('city').addEventListener('change', e => { if (!PLACES[e.target.value]) return; S.place = PLACES[e.target.value]; store.set('place', S.place); recompute(); });
    const commit = e => {
      const v = fromPlaceStamp(e.target.value.trim());
      if (v) { S.playing = false; S.fixed = v; S.offsetMs = 0; S.preview = 0; $('preview').value = 0; recompute(); e.target.classList.remove('bad'); }
      else e.target.classList.add('bad');
    };
    $('when').addEventListener('change', commit);
    $('when').addEventListener('keydown', e => { if (e.key === 'Enter') { commit(e); e.target.blur(); } });
    $('here').addEventListener('click', () => locate(true));
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      let m = b.dataset.mode;
      if ((m === 'natal' || m === 'synastry') && !S.natal) { openBirth(); return; }
      if (m === 'chart' && S.mode === 'natal') m = 'natalchart';          // the nativity as a chart: chart + natal lit together
      else if (m === 'natal' && S.mode === 'chart') m = 'natalchart';
      S.mode = m; store.set('mode', S.mode); recompute();
    }));
    $('birth-open').addEventListener('click', openBirth);
    $('birth-close').addEventListener('click', () => { $('birth').hidden = true; });
    $('birth-save').addEventListener('click', saveBirth);
    $('birth-clear').addEventListener('click', () => { S.natal = null; store.set('natal', null); if (natalModes.includes(S.mode)) S.mode = 'clock'; $('birth').hidden = true; recompute(); });
    $('wallpaper').addEventListener('click', exportWallpaper);
    $('lang').addEventListener('click', () => setLang(S.lang === 'es' ? 'en' : 'es'));
    $('save').addEventListener('click', () => exportPNG(2048));
    const bc = $('birth-city'); bc.innerHTML = ZONES.map(z => `<option value="${z.name}">${offsetOf(z.tz)} · ${z.name}</option>`).join('');
    $('sigil').addEventListener('click', () => { S.sigil = !S.sigil; S.dirty = true; updateControls(); });
    $('preview').addEventListener('input', e => { S.preview = Number(e.target.value); recompute(); });
    $('save-hd').addEventListener('click', () => exportPNG(4096));
    $('info').addEventListener('click', () => document.body.classList.toggle('reading'));
    $('about-open').addEventListener('click', () => { $('about').hidden = !$('about').hidden; $('about-open').classList.toggle('on', !$('about').hidden); });
    $('about-close').addEventListener('click', () => { $('about').hidden = true; $('about-open').classList.remove('on'); });
    $('listen').addEventListener('click', () => listen(!audio.on));
    $('full').addEventListener('click', () => {
      document.body.classList.toggle('bare');
      if (document.body.classList.contains('bare') && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen();
    });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'f') $('full').click();
      if (e.key === 'i') $('info').click();
      if (e.key === 's') $('sigil').click();
      if (e.key === 'l') $('listen').click();
      if (e.key === ' ') { e.preventDefault(); $('play').click(); }
      if (e.key === 'ArrowRight') { S.offsetMs += (e.shiftKey ? 24 : 1) * 3600e3; recompute(); }
      if (e.key === 'ArrowLeft') { S.offsetMs -= (e.shiftKey ? 24 : 1) * 3600e3; recompute(); }
      if (e.key === 'Escape') { document.body.classList.remove('bare', 'reading'); $('about').hidden = true; $('about-open').classList.remove('on'); $('birth').hidden = true; }
    });
    window.addEventListener('resize', size);
    if (params.get('hd') !== '1') $('save-hd').hidden = true;
  }

  /* ---------- the nativity: birth data, kept on this device only ---------- */
  function openBirth() {
    const n = S.natal;
    if (n) {
      const p = placeParts(new Date(n.date), n.place.tz);
      $('birth-date').value = `${p.year}-${p.month}-${p.day}`; $('birth-time').value = n.unknownTime ? '' : `${p.hour}:${p.minute}`;
      $('birth-unknown').checked = !!n.unknownTime;
      if (PLACES[n.place.name]) $('birth-city').value = n.place.name;
      $('birth-lat').value = n.place.lat; $('birth-lon').value = n.place.lon;
    } else { $('birth-city').value = S.place.name in PLACES ? S.place.name : 'greenwich'; $('birth-lat').value = ''; $('birth-lon').value = ''; }
    $('birth-note').textContent = '';
    $('birth').hidden = false;
  }
  function saveBirth() {
    const dateTxt = $('birth-date').value.trim(), unknown = $('birth-unknown').checked, timeTxt = unknown ? '12:00' : $('birth-time').value.trim();
    const city = PLACES[$('birth-city').value];
    const lat = parseFloat($('birth-lat').value), lon = parseFloat($('birth-lon').value);
    const place = Number.isFinite(lat) && Number.isFinite(lon) ? { name: $('birth-place').value.trim().toLowerCase() || city.name, lat, lon, tz: city.tz } : { ...city };
    const d = fromStamp(`${dateTxt} ${timeTxt}`, place.tz);
    if (!d) { $('birth-note').textContent = CW.i18n.t('ui.badDate'); return; }
    S.natal = { date: d.toISOString(), place, unknownTime: unknown };
    store.set('natal', S.natal);
    $('birth').hidden = true;
    if (S.mode !== 'natal' && S.mode !== 'synastry') S.mode = 'synastry';
    store.set('mode', S.mode); recompute();
  }

  /* the moment as the place reads it: yyyy-mm-dd hh:mm in the place's time zone */
  function placeParts(d, tz) {
    const f = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz || 'UTC' });
    return Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  }
  function placeStamp(d) { const p = placeParts(d, S.place.tz); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; }
  function fromStamp(txt, tz) {
    const m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ t](\d{1,2}):(\d{2})$/i);
    if (!m) return null;
    const want = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    let t = want;                                           // the zone's offset at that moment, found by two corrections
    for (let i = 0; i < 2; i++) { const p = placeParts(new Date(t), tz); t += want - Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute); }
    return new Date(t);
  }
  const fromPlaceStamp = txt => fromStamp(txt, S.place.tz);

  /* ---------- the gesture: turn the dial to travel in time ----------
     clockwise = forward. one full turn = one day. the wheel moves ten minutes a notch. */
  function bindGesture() {
    /* one finger or the mouse turns the dial (time). two fingers pinch to zoom and pan.
       ctrl/⌘ + wheel, or a trackpad pinch, zooms at the pointer. the plain wheel moves time.
       double click or double tap returns to the whole dial. */
    const pts = new Map();
    let drag = null, pinch = null, lastTap = 0;
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const toDial = p => ({ x: (p.x - view.x) / view.z, y: (p.y - view.y) / view.z });
    const clampView = () => {
      view.z = Math.max(1, Math.min(8, view.z));
      if (view.z === 1) { view.x = 0; view.y = 0; }
      view.x = Math.min(0, Math.max(S.side * (1 - view.z), view.x));
      view.y = Math.min(0, Math.max(S.side * (1 - view.z), view.y));
      S.dirty = true;
    };
    const zoomAt = (p, z) => { const w = toDial(p); view.z = z; view.x = p.x - w.x * view.z; view.y = p.y - w.y * view.z; clampView(); };
    const angleAt = p => { const Lt = CW.render.layout(S.side), q = toDial(p); return { a: Math.atan2(q.y - Lt.cy, q.x - Lt.cx), d: Math.hypot(q.y - Lt.cy, q.x - Lt.cx), R: Lt.Rb }; };
    const endTurn = () => { if (!drag) return; drag = null; S.dragging = false; canvas.classList.remove('turning'); recompute(); };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {                                  // second finger: leave time alone, start the pinch
        endTurn();
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z, w: toDial({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
        view.pinching = true; return;
      }
      const now = performance.now();
      if (now - lastTap < 300) { view.z = 1; clampView(); lastTap = 0; return; }   // double tap: the whole dial
      lastTap = now;
      const p = angleAt(local(e)); if (p.d > p.R) return;
      drag = { last: p.a, base: base().getTime() + S.preview * 60000, turned: 0 };
      S.playing = false; S.dragging = true; canvas.classList.add('turning');
    });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        view.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
        view.x = mid.x - pinch.w.x * Math.max(1, Math.min(8, view.z)); view.y = mid.y - pinch.w.y * Math.max(1, Math.min(8, view.z));
        clampView(); return;
      }
      if (!drag) return;
      const p = angleAt(local(e));
      let d = p.a - drag.last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      drag.last = p.a; drag.turned += d;                    // screen y points down: a positive delta is clockwise
      S.fixed = new Date(drag.base + drag.turned / (2 * Math.PI) * 864e5); S.offsetMs = 0; S.preview = 0; $('preview').value = 0;
      recompute();
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) { pinch = null; view.pinching = false; S.dirty = true; }
      if (!pts.size) endTurn();
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('dblclick', () => { view.z = 1; clampView(); });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { zoomAt(local(e), view.z * Math.exp(-e.deltaY * 0.005)); return; }   // trackpad pinch arrives as ctrl + wheel
      S.playing = false; S.fixed = new Date(base().getTime() + S.preview * 60000 + Math.sign(e.deltaY) * 600000); S.offsetMs = 0; S.preview = 0; $('preview').value = 0;
      recompute();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const c = { x: S.side / 2, y: S.side / 2 };
      if (e.key === '+' || e.key === '=') zoomAt(c, view.z * 1.4);
      if (e.key === '-' || e.key === '_') zoomAt(c, view.z / 1.4);
      if (e.key === '0') { view.z = 1; clampView(); }
    });
  }

  /* the device's position: asked once on the first visit, and whenever "here" is pressed */
  function locate(asked) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => {
      S.place = { name: 'here', lat: p.coords.latitude, lon: p.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      store.set('place', S.place);
      const sel = $('city'); if (![...sel.options].some(o => o.value === '')) sel.insertAdjacentHTML('beforeend', '<option value="">here</option>');
      sel.value = ''; recompute();
    }, () => { if (asked) $('here').title = 'location not available on this device or browser'; }, { timeout: 10000, maximumAge: 3600e3 });
  }

  function setLang(l) {
    S.lang = l; store.set('lang', l); CW.i18n.set(l); CW.i18n.apply();
    document.querySelectorAll('[data-about]').forEach(el => { el.hidden = el.dataset.about !== l; });
    scan.key = null;                                        // the week's labels are rebuilt in the new language
    if (S.state) recompute(); drawNexts();
  }

  async function start() {
    CW.i18n.set(S.lang); CW.i18n.apply();
    document.querySelectorAll('[data-about]').forEach(el => { el.hidden = el.dataset.about !== S.lang; });
    try {
      await Promise.all(['400 20px Geist', '500 20px Geist', '400 20px "Geist Mono"'].map(f => document.fonts.load(f)));
    } catch (e) { /* fonts are a nicety */ }
    if (natalModes.includes(S.mode) && !S.natal) S.mode = 'clock';
    bind(); bindGesture(); size(); recompute(); drawNexts();
    if (S.firstVisit || S.place.name === 'here') locate(false);
    requestAnimationFrame(frame);
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !/claude\.ai$/.test(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  CW.app = { start, exportPNG, exportWallpaper, setLang, S, viewState };
  start();
})(window.CW = window.CW || {});
