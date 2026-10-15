/*  cosmo weather — engine
    sky → state. Pure computation, no drawing. This file is the part that
    survives every port (desktop, android, wallpaper, the daily export).
*/
(function (CW) {
  'use strict';
  const A = window.Astronomy;
  const C = CW.corr;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const norm360 = x => ((x % 360) + 360) % 360;
  const norm180 = x => { const y = norm360(x); return y > 180 ? y - 360 : y; };
  const sep = (a, b) => Math.abs(norm180(a - b));
  const WINDOW_DAYS = 1.5;   // "exact on that day": the portal is open within about a day and a half of exactness
  const MOON_WINDOW_DAYS = 0.25;   // the moon's windows are hours: it moves a degree every two hours

  /* ---------- positions ---------- */
  function eclipticOfDate(body, t) {
    const v = A.GeoVector(body, t, true);
    const r = A.RotateVector(A.Rotation_EQJ_ECT(t), v);
    return A.SphereFromVector(r).lon;
  }
  function eclToEq(lonDeg, eps) {
    const l = lonDeg * D2R;
    const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l));
    const dec = Math.asin(Math.sin(eps) * Math.sin(l));
    return { ra: norm360(ra * R2D), dec: dec * R2D };
  }
  function semiArc(decDeg, latDeg) {
    const x = -Math.tan(latDeg * D2R) * Math.tan(decDeg * D2R);
    if (x <= -1) return 180;      // circumpolar, never sets
    if (x >= 1) return 0;         // never rises
    return Math.acos(x) * R2D;
  }
  /* Placidian mundane position: 0 at rising, 3 culminating, 6 setting, 9 anti-culminating.
     Each unit is one third of the body's own semi-arc — the same unequal division as the planetary hours. */
  function mundane(H, dsa) {
    const d = Math.min(179.5, Math.max(0.5, dsa)), n = 180 - d;
    if (H >= -d && H < 0) return 3 * (H + d) / d;
    if (H >= 0 && H < d) return 3 + 3 * H / d;
    if (H >= d) return 6 + 3 * (H - d) / n;
    return 9 + 3 * (H + 180) / n;
  }
  const houseOf = p => 12 - Math.floor(norm360(p * 30) / 30);

  function angles(t, loc, eps) {
    const gast = A.SiderealTime(t);
    const ramc = norm360(gast * 15 + loc.lon);
    const R = ramc * D2R, phi = loc.lat * D2R;
    const mc = norm360(Math.atan2(Math.sin(R), Math.cos(R) * Math.cos(eps)) * R2D);
    const asc = norm360(Math.atan2(Math.cos(R), -(Math.sin(R) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * R2D);
    return { ramc, mc, asc, lst: ramc };
  }

  /* Placidus cusps by semi-arc iteration (for the chart mode) */
  function placidus(ramc, lat, eps, asc, mc) {
    const cusp = (frac, below) => {
      let ra = norm360(ramc + (below ? 180 : 0) + frac * 90 * (below ? 1 : 1));
      let lon = 0;
      for (let i = 0; i < 30; i++) {
        lon = norm360(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps)) * R2D);
        const dec = Math.asin(Math.sin(eps) * Math.sin(lon * D2R)) * R2D;
        const dsa = semiArc(dec, lat);
        ra = below ? norm360(ramc + dsa + frac * (180 - dsa) * 3 / 3) : norm360(ramc + frac * dsa);
      }
      return lon;
    };
    // above horizon, east: 11 = 1/3, 12 = 2/3 of diurnal semi-arc from MC
    const c11 = cusp(1 / 3, false), c12 = cusp(2 / 3, false);
    // below horizon, east: 2 = 1/3, 3 = 2/3 of nocturnal semi-arc past the ascendant
    const c2 = cusp(1 / 3, true), c3 = cusp(2 / 3, true);
    const c = [];
    c[1] = asc; c[2] = c2; c[3] = c3; c[4] = norm360(mc + 180);
    c[5] = norm360(c11 + 180); c[6] = norm360(c12 + 180); c[7] = norm360(asc + 180);
    c[8] = norm360(c2 + 180); c[9] = norm360(c3 + 180); c[10] = mc; c[11] = c11; c[12] = c12;
    return c;
  }

  /* ---------- dignity ---------- */
  function dignity(key, signIdx, deg, isDay) {
    const s = C.SIGNS[signIdx], labels = [];
    let score = 0, positive = false;
    const P = C.PLANETS[key];
    if ((C.DOMICILE[key] || []).includes(s.key)) { score += 5; labels.push('domicile'); positive = true; }
    const opp = C.SIGNS[(signIdx + 6) % 12].key;
    if ((C.DOMICILE[key] || []).includes(opp)) { score -= 5; labels.push('detriment'); }
    if (P.kind === 'optic') return { score, labels, peregrine: false };
    if (C.EXALTATION[key] === s.key) { score += 4; labels.push('exaltation'); positive = true; }
    if (C.EXALTATION[key] === opp) { score -= 4; labels.push('fall'); }
    if (C.TRIPLICITY[s.element][isDay ? 0 : 1] === key) { score += 3; labels.push('triplicity'); positive = true; }
    const term = C.TERMS[s.key].find(tr => deg < tr[1]);
    if (term && term[0] === key) { score += 2; labels.push('term'); positive = true; }
    if (C.faceRuler(signIdx * 3 + Math.floor(deg / 10)) === key) { score += 1; labels.push('face'); positive = true; }
    const peregrine = !positive;
    if (peregrine) { score -= 5; labels.push('peregrine'); }
    return { score, labels, peregrine };
  }

  /* ---------- planetary day and hour ---------- */
  function weekdayAt(date, loc) {
    if (loc.tz) {
      const w = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: loc.tz }).format(date);
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
    }
    return new Date(date.getTime() + loc.lon / 15 * 3600e3).getUTCDay();
  }
  function planetaryHour(t, obs, loc) {
    const S = A.Body.Sun;
    let rise = A.SearchRiseSet(S, obs, +1, t.AddDays(-1.1), 1.2);
    if (!rise) return fallbackHour(t, loc);
    for (;;) {
      const r2 = A.SearchRiseSet(S, obs, +1, rise.AddDays(0.01), 1.2);
      if (r2 && r2.ut <= t.ut) rise = r2; else break;
    }
    const set = A.SearchRiseSet(S, obs, -1, rise, 1.2);
    if (!set) return fallbackHour(t, loc);
    const dayRuler = C.WEEKDAY_RULER[weekdayAt(rise.date, loc)];
    let isDay, start, len, idx;
    if (t.ut < set.ut) {
      isDay = true; start = rise.ut; len = (set.ut - rise.ut) / 12; idx = Math.floor((t.ut - start) / len);
    } else {
      const next = A.SearchRiseSet(S, obs, +1, set, 1.2);
      if (!next) return fallbackHour(t, loc);
      isDay = false; start = set.ut; len = (next.ut - set.ut) / 12; idx = 12 + Math.floor((t.ut - start) / len);
    }
    idx = Math.max(0, Math.min(23, idx));
    const ruler = C.CHALDEAN[(C.CHALDEAN.indexOf(dayRuler) + idx) % 7];
    return { dayRuler, hourRuler: ruler, index: idx, isDay, angel: C.PLANETS[ruler].angel, dayAngel: C.PLANETS[dayRuler].angel,
      sunrise: rise.date, sunset: set.date, hourLengthMin: len * 1440 };
  }
  function fallbackHour(t, loc) {
    const local = new Date(t.date.getTime() + loc.lon / 15 * 3600e3);
    const h = local.getUTCHours() + local.getUTCMinutes() / 60;
    const isDay = h >= 6 && h < 18;
    const idx = isDay ? Math.floor(h - 6) : 12 + Math.floor(((h - 18) + 24) % 24);
    const dayRuler = C.WEEKDAY_RULER[(local.getUTCDay() + (h < 6 ? 6 : 0)) % 7];
    const ruler = C.CHALDEAN[(C.CHALDEAN.indexOf(dayRuler) + idx) % 7];
    return { dayRuler, hourRuler: ruler, index: idx, isDay, angel: C.PLANETS[ruler].angel, dayAngel: C.PLANETS[dayRuler].angel, polar: true };
  }

  /* ---------- aspects and hierarchy ---------- */
  function synodic(a, b) {
    const k = [a, b].sort((x, y) => C.ORDER.indexOf(x) - C.ORDER.indexOf(y)).join('|');
    if (C.SYNODIC_OVERRIDE[k]) return C.SYNODIC_OVERRIDE[k];
    const pa = C.PLANETS[a].period, pb = C.PLANETS[b].period;
    const d = Math.abs(1 / pa - 1 / pb);
    return d < 1e-9 ? 365.25 : 1 / d;
  }
  const rarity = (a, b) => Math.min(1, Math.max(0, (Math.log10(synodic(a, b)) - 1.4) / 3.9));

  function findAspects(B) {
    const out = [];
    const keys = C.ORDER;
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = B[keys[i]], b = B[keys[j]];
      const d = sep(a.lon, b.lon);
      const lum = (keys[i] === 'sun' || keys[i] === 'moon' || keys[j] === 'moon');
      let best = null;
      for (const asp of C.ASPECTS) {
        const orbMax = asp.orb + (lum && asp.n <= 6 ? 2 : 0);
        const orb = Math.abs(d - asp.angle);
        if (orb <= orbMax && (!best || orb / orbMax < best.orb / best.orbMax)) best = { asp, orb, orbMax };
      }
      if (!best) continue;
      // applying: is the orb shrinking over the next hour?
      const d1 = sep(a.lon + a.speed / 24, b.lon + b.speed / 24);
      const applying = Math.abs(d1 - best.asp.angle) < best.orb;
      const exact = 1 - best.orb / best.orbMax;
      // a window is measured in time, not degrees: slow pairs linger in orb for years,
      // so they open the portal only in the days around the exact pass
      const rate = Math.abs(d1 - d) * 24;                              // degrees per day
      const days = best.orb < 0.1 ? 0 : best.orb / Math.max(rate, 1e-4);
      const isMoon = a.key === 'moon' || b.key === 'moon';
      const windowT = Math.exp(-0.5 * Math.pow(days / (isMoon ? MOON_WINDOW_DAYS : WINDOW_DAYS), 2));
      const rar = rarity(a.key, b.key);
      let mods = applying ? 1.2 : 0.8;
      if (a.station || b.station) mods *= 1.5;
      if ((a.key === 'sun' || b.key === 'sun') && !(a.key === 'moon' || b.key === 'moon')) mods *= 1.2;
      const sky = (0.2 + 0.8 * rar) * best.asp.weight * (0.3 * Math.pow(exact, 1.5) + 0.7 * windowT) * mods;   // the sky's own weight
      if (a.angular || b.angular) mods *= 1.3;                                                                // local: the horizon turning
      const power = (0.2 + 0.8 * rar) * best.asp.weight * (0.3 * Math.pow(exact, 1.5) + 0.7 * windowT) * mods;
      out.push({
        a: a.key, b: b.key, aspect: best.asp.key, n: best.asp.n, k: best.asp.k, nature: best.asp.nature,
        angle: best.asp.angle, orb: best.orb, orbMax: best.orbMax, exact, applying, rarity: rar, power, sky, days, window: windowT,
        moon: a.key === 'moon' || b.key === 'moon'
      });
    }
    return out.sort((x, y) => y.power - x.power);
  }

  function findEvents(t, B, aspects, light) {
    const ev = [];
    if (!light) try {
      const le = A.SearchLunarEclipse(t.AddDays(-1));
      if (le && Math.abs(le.peak.ut - t.ut) < 1) ev.push({ type: 'eclipse', kind: 'lunar', priority: 100, at: le.peak.date });
      const se = A.SearchGlobalSolarEclipse(t.AddDays(-1));
      if (se && Math.abs(se.peak.ut - t.ut) < 1) ev.push({ type: 'eclipse', kind: 'solar', priority: 100, at: se.peak.date });
    } catch (e) { /* eclipse search is best-effort */ }
    const sm = aspects.find(x => x.a === 'sun' && x.b === 'moon');
    if (sm && (sm.aspect === 'conjunction' || sm.aspect === 'opposition') && sm.orb < 1.5)
      ev.push({ type: 'lunation', kind: sm.aspect === 'conjunction' ? 'new moon' : 'full moon', priority: 90, aspect: sm });
    for (const k of C.ORDER) {
      if (k === 'sun') continue;
      const b = B[k];
      if (b.cazimi) ev.push({ type: 'cazimi', planet: k, priority: 80 });
      if (b.station) ev.push({ type: 'station', planet: k, priority: 60, direction: b.speed < 0 ? 'retrograde' : 'direct' });
    }
    const slow = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    for (const a of aspects) if (slow.includes(a.a) && slow.includes(a.b) && a.orb < 0.25 && a.n <= 6)
      ev.push({ type: 'outer exact', aspect: a, priority: 70 });
    return ev.sort((x, y) => y.priority - x.priority);
  }

  /* The figure: one primary configuration, up to two secondary rings, a lunar ripple. */
  function selectConfigs(aspects, events, B) {
    const configs = [];
    const lunation = events.find(e => e.type === 'lunation');
    const eclipse = events.find(e => e.type === 'eclipse');
    if (lunation) configs.push(Object.assign({}, lunation.aspect, { power: Math.max(1.2, lunation.aspect.power * 3), event: eclipse ? eclipse.kind + ' eclipse' : lunation.kind }));
    for (const e of events) if (e.type === 'cazimi') {
      const a = aspects.find(x => x.a === 'sun' && x.b === e.planet);
      if (a) configs.push(Object.assign({}, a, { power: Math.max(1.0, a.power * 2.5), event: 'cazimi' }));
    }
    for (const e of events) if (e.type === 'outer exact') {
      if (!configs.find(c => c.a === e.aspect.a && c.b === e.aspect.b)) configs.push(Object.assign({}, e.aspect, { power: e.aspect.power * 2, event: 'exact' }));
    }
    for (const a of aspects) {
      if (configs.length >= 3) break;
      if (configs.find(c => c.a === a.a && c.b === a.b)) continue;
      if (a.power < 0.08) continue;
      configs.push(a);
    }
    configs.sort((x, y) => y.power - x.power);
    const stations = events.filter(e => e.type === 'station').map(e => ({ type: 'station', planet: e.planet, direction: e.direction, n: C.PLANETS[e.planet].number || 0, power: 0.5 }));
    const ripple = aspects.find(a => a.moon && a.a !== 'sun') || null;
    const primary = configs[0] || null;
    return { primary, secondary: configs.slice(1, 3), stations, ripple, ...portalShape(B, aspects, primary) };
  }

  /* Portal shape. Jupiter owns scale, Saturn owns restriction: the portal grows or shrinks with
     their dignity and with their part in the figure. A hard aspect from a third planet to either
     planet of the figure removes a wedge, pointed at the afflicting planet. The moon never cuts. */
  function portalShape(B, aspects, primary) {
    if (!primary) return { scale: 1, expansion: 0, cut: null };
    const inv = k => k === primary.a || k === primary.b;
    const jx = B.jupiter.dignity.score / 10, sx = B.saturn.dignity.score / 10;
    let e = 0.3 * (jx - sx) + (inv('jupiter') ? 0.6 : 0) - (inv('saturn') ? 0.6 : 0)
      + (inv('venus') || inv('sun') ? 0.15 : 0) - (inv('pluto') ? 0.3 : 0);
    if (e > 0) e *= 1 - 0.5 * B.jupiter.slow;            // jupiter slowing: the expansion turns inward
    const scale = Math.max(0.5, Math.min(1.5, 1 + 0.45 * e));
    let cut = null;
    for (const a of aspects) {
      const malefic = (a.a === 'mars' || a.a === 'saturn' || a.b === 'mars' || a.b === 'saturn');
      if (a.nature !== 'hard' && !(a.aspect === 'conjunction' && malefic)) continue;
      if (a.moon && !a.applying) continue;                // the moon afflicts by what it moves toward
      const ia = inv(a.a), ib = inv(a.b);
      if (ia === ib) continue;                             // exactly one planet of the figure
      if (a.power < 0.06) continue;
      if (!cut || a.power > cut.power) cut = { by: ia ? a.b : a.a, target: ia ? a.a : a.b, aspect: a.aspect, power: a.power,
        width: Math.max(24, Math.min(100, 24 + 70 * Math.min(1, a.power * 1.5))) };
    }
    return { scale, expansion: e, cut };
  }

  /* The moon's electional condition: is the moment ripe?
     next = the first Ptolemaic aspect the moon will perfect with a classical planet before leaving its sign.
     none = void of course. Applying to mars or saturn by conjunction, square or opposition = afflicted.
     Within 12° of the sun = under the beams (combust within 8.5°). 15° libra – 15° scorpio = via combusta. */
  function moonCondition(B, eps) {
    const m = B.moon, left = 30 - m.deg;
    const angles = [['conjunction', 0], ['sextile', 60], ['square', 90], ['trine', 120], ['opposition', 180]];
    let next = null;
    for (const k of ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      const p = B[k], rel = m.speed - p.speed;
      if (rel <= 0) continue;
      for (const [name, A] of angles) for (const sgn of A === 0 || A === 180 ? [1] : [1, -1]) {
        const target = p.lon + sgn * A;
        const dist = norm360(target - m.lon);                // ahead of the moon
        const days = dist / rel;
        if (dist > 0.01 && m.speed * days <= left && (!next || days < next.days)) next = { planet: k, aspect: name, days };
      }
    }
    const dSun = sep(m.lon, B.sun.lon);
    const flags = [];
    if (!next) flags.push('void of course');
    if (dSun < 8.5) flags.push('combust'); else if (dSun < 12) flags.push('under the beams');
    if (m.lon >= 195 && m.lon < 225) flags.push('via combusta');
    let ripe = 0;
    if (!next) ripe -= 1;
    else {
      const mal = next.planet === 'mars' || next.planet === 'saturn', ben = next.planet === 'venus' || next.planet === 'jupiter';
      const hardA = next.aspect === 'square' || next.aspect === 'opposition' || (next.aspect === 'conjunction' && mal);
      if (mal && hardA) ripe -= 0.7; else if (hardA) ripe -= 0.35;
      if (ben || next.aspect === 'trine' || next.aspect === 'sextile') ripe += 0.6;
    }
    if (dSun < 8.5) ripe -= 0.7; else if (dSun < 12) ripe -= 0.4;
    if (m.lon >= 195 && m.lon < 225) ripe -= 0.3;
    if (m.speed > 13.2) ripe += 0.1;
    const verdict = !next ? 'void' : ripe >= 0.3 ? 'ripe' : ripe <= -0.3 ? 'unripe' : 'open';
    return { next, flags, ripe, verdict };
  }

  /* The chord of the moment. Each planet of the two strongest figures sounds the note of the sign it stands in
     (Case's colour–note scale). Three or more notes forming a known chord are named; otherwise the
     figure's two planets give a dyad, first > second. */
  const CHORDS = [
    [[0, 4, 7, 11], 'maj7'], [[0, 4, 7, 10], '7'], [[0, 3, 7, 10], '-7'], [[0, 3, 6, 10], 'ø'], [[0, 3, 6, 9], 'dim7'],
    [[0, 4, 7], ''], [[0, 3, 7], '-'], [[0, 3, 6], 'dim'], [[0, 4, 8], '+'], [[0, 5, 7], 'sus4'], [[0, 2, 7], 'sus2']
  ];
  function chordOf(st) {
    // the harmony of the sky: the two strongest figures, moon included, weighed without the turning horizon
    const figs = st.aspects.filter(a => a.sky >= 0.08).sort((x, y) => y.sky - x.sky).slice(0, 2);
    if (!figs.length) return { name: 'none', notes: [] };
    const planets = [...new Set(figs.flatMap(f => [f.a, f.b]))];
    const pcs = [...new Set(planets.map(k => st.bodies[k].sign))].sort((a, b) => a - b);
    const N = C.NOTES;
    for (const [tmpl, suffix] of CHORDS) {
      if (tmpl.length !== pcs.length) continue;
      for (const root of pcs) {
        const set = tmpl.map(i => (root + i) % 12).sort((a, b) => a - b);
        if (set.join() === pcs.join()) return { name: N[root] + suffix, notes: pcs.map(i => N[i]), planets };
      }
    }
    const a = N[st.bodies[figs[0].a].sign], b = N[st.bodies[figs[0].b].sign];
    return { name: a === b ? a : `${a}>${b}`, notes: pcs.map(i => N[i]), planets, dyad: true };
  }

  /* The three windows: how far the moment serves ideation, incarnation, destruction (0..1).
     The figure's planets and their signs must belong to the mother, the figure's nature must match it,
     and the moment must be beautiful for that work: whole, with harmonious guardians and a ripe moon
     (destruction takes the cut, the clash and the waning moon instead). */
  function windowsOf(st) {
    const cf = st.configs, p = cf.primary, out = {};
    const figs = [p, ...cf.secondary].filter(Boolean);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const nd = C.PLANETS[st.hour.dayRuler].number, nh = C.PLANETS[st.hour.hourRuler].number;
    const guard = st.hour.dayRuler === st.hour.hourRuler ? 1 : gcd(nd, nh) > 1 ? 0.85 : 0.6;
    for (const [key, M] of Object.entries(C.MOTHERS)) {
      if (!p) { out[key] = 0; continue; }
      let fam = 0, el = 0, n = 0;
      for (const f of figs) {
        const w = f === p ? 1 : 0.5;
        for (const k of [f.a, f.b]) {
          fam += w * (M.planets[k] || 0);
          el += w * (M.elements.includes(C.SIGNS[st.bodies[k].sign].element) ? 1 : 0);
          n += w;
        }
      }
      fam /= n; el /= n;
      const soft = p.nature !== 'hard';
      const nature = M.wants === 'hard' ? (soft ? 0.35 : 1) : (soft ? 1 : 0.3);
      const v = st.moon.verdict;
      let beauty;
      if (key === 'destruction') beauty = (cf.cut ? 1 : 0.8) * (guard < 0.7 ? 1 : 0.85) * ({ ripe: 0.6, open: 0.8, unripe: 1, void: 0.3 }[v]) * (st.moon.waxing ? 0.8 : 1);
      else beauty = (cf.cut ? 0.55 : 1) * guard * ({ ripe: 1, open: 0.75, unripe: 0.4, void: 0.15 }[v]) * (key === 'incarnation' ? (st.moon.waxing ? 1 : 0.8) : 1);
      const strength = Math.min(1, Math.sqrt(p.power));
      out[key] = Math.min(1, strength * (0.25 + 0.75 * fam) * (0.4 + 0.6 * el) * nature * beauty * 1.6);
    }
    return out;
  }

  /* The next chord shift: walk forward in 10-minute steps until the chord's name changes,
     then halve the interval down to the minute. */
  function nextChordShift(date, loc, maxDays = 7) {
    const name = d => compute(d, loc, { light: true }).chord.name;
    const from = name(date), t0 = date.getTime(), step = 10 * 60000;
    for (let t = t0 + step; t <= t0 + maxDays * 864e5; t += step) {
      if (name(new Date(t)) === from) continue;
      let lo = t - step, hi = t;
      while (hi - lo > 60000) { const mid = (lo + hi) / 2; if (name(new Date(mid)) === from) lo = mid; else hi = mid; }
      return { at: new Date(Math.round(hi / 60000) * 60000), from, to: name(new Date(hi)) };
    }
    return null;
  }

  /* ---------- the whole state ---------- */
  function compute(date, loc, opts = {}) {
    const t = A.MakeTime(date);
    const obs = new A.Observer(loc.lat, loc.lon, 0);
    const eps = A.e_tilt(t).tobl * D2R;
    const ang = angles(t, loc, eps);
    const sunLon = eclipticOfDate(A.Body.Sun, t);
    const t1 = t.AddDays(0.5), t0 = t.AddDays(-0.5);
    const B = {};
    for (const key of C.ORDER) {
      const P = C.PLANETS[key];
      const lon = eclipticOfDate(A.Body[P.body], t);
      const speed = norm180(eclipticOfDate(A.Body[P.body], t1) - eclipticOfDate(A.Body[P.body], t0));
      const eq = A.Equator(A.Body[P.body], t, obs, true, true);
      const hor = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
      const ra = eq.ra * 15, dec = eq.dec;
      const H = norm180(ang.lst - ra);
      const dsa = semiArc(dec, loc.lat);
      const p = mundane(H, dsa);
      const signIdx = Math.floor(lon / 30), deg = lon % 30;
      const meanSpeed = 360 / (key === 'mercury' || key === 'venus' ? 365.256 : P.period);
      const retro = speed < 0;
      const station = key !== 'sun' && key !== 'moon' && Math.abs(speed) < 0.12 * meanSpeed;
      // slowness drives blur: full when retrograde, ramps in as a direct planet slows toward station
      const slow = retro ? 1 : Math.max(0, Math.min(1, 1 - speed / (0.5 * meanSpeed)));
      const dSun = sep(lon, sunLon);
      const angular = [0, 3, 6, 9].some(c => Math.abs(norm180((p - c) * 30)) < 0.35 * 30);
      B[key] = {
        key, lon, speed, retro, station, slow: key === 'sun' || key === 'moon' ? 0 : slow,
        ra, dec, alt: hor.altitude, az: hor.azimuth, H, dsa, p, house: 1 + Math.floor(norm360(lon - ang.asc) / 30), angular,
        sign: signIdx, deg, combust: key !== 'sun' && dSun < 8.5 && dSun >= 0.2833, cazimi: key !== 'sun' && key !== 'moon' && dSun < 0.2833
      };
    }
    const isDay = B.sun.alt > -0.833;
    for (const key of C.ORDER) {
      const b = B[key];
      b.dignity = key === 'sun' || key === 'moon' || C.PLANETS[key].kind === 'pigment' || C.PLANETS[key].kind === 'optic'
        ? dignity(key, b.sign, b.deg, isDay) : { score: 0, labels: [] };
      let clarity = Math.max(0.18, Math.min(1, 0.62 + b.dignity.score / 16));
      if (b.combust) clarity *= 0.6;
      b.clarity = clarity;
    }
    const phaseAngle = A.MoonPhase(t);
    const moon = { phaseAngle, illum: (1 - Math.cos(phaseAngle * D2R)) / 2, waxing: phaseAngle < 180 };
    const hour = planetaryHour(t, obs, loc);
    const aspects = findAspects(B);
    const events = findEvents(t, B, aspects, opts.light);
    const configs = selectConfigs(aspects, events, B);
    const lunar = moonCondition(B, eps);
    const cusps = placidus(ang.ramc, loc.lat, eps, ang.asc, ang.mc);
    const st = { date, loc, eps, ...ang, bodies: B, sect: isDay ? 'day' : 'night', moon: { ...moon, ...lunar }, hour, aspects, events, configs, cusps };
    st.chord = chordOf(st);
    st.windows = windowsOf(st);
    return st;
  }

  CW.engine = { compute, nextChordShift, norm360, norm180, sep, houseOf, mundane, semiArc, dignity, placidus, synodic, rarity };
})(window.CW = window.CW || {});
