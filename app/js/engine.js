/*  siderarium — engine
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
  /* Regiomontanus cusps (Lilly's system): the equator divided into twelve from the meridian, each division carried
     to the ecliptic by a great circle through the north and south points of the horizon. Such a circle is the horizon
     of a latitude whose tangent is tan(lat)·sin(H), so each cusp is an ascendant computed for that pole. */
  function regiomontanus(ramc, lat, eps, asc, mc) {
    const phi = lat * D2R;
    const cuspAt = H => {
      const pole = Math.atan(Math.tan(phi) * Math.sin(H * D2R));
      const R = (ramc + H - 90) * D2R;
      return norm360(Math.atan2(Math.cos(R), -(Math.sin(R) * Math.cos(eps) + Math.tan(pole) * Math.sin(eps))) * R2D);
    };
    const c = [];
    c[1] = asc; c[10] = mc; c[11] = cuspAt(30); c[12] = cuspAt(60); c[2] = cuspAt(120); c[3] = cuspAt(150);
    c[4] = norm360(mc + 180); c[7] = norm360(asc + 180);
    c[5] = norm360(c[11] + 180); c[6] = norm360(c[12] + 180); c[8] = norm360(c[2] + 180); c[9] = norm360(c[3] + 180);
    return c;
  }
  function equalHouses(asc) { const c = []; for (let k = 1; k <= 12; k++) c[k] = norm360(asc + (k - 1) * 30); return c; }
  function houseIn(cusps, lon) {
    for (let k = 1; k <= 12; k++) { const a = cusps[k], b = cusps[k % 12 + 1]; if (norm360(lon - a) < norm360(b - a)) return k; }
    return 1;
  }

  /* ---------- dignity ---------- */
  function dignity(key, signIdx, deg, isDay) {
    const s = C.SIGNS[signIdx], labels = [];
    let score = 0, positive = false;
    const P = C.PLANETS[key];
    if (P.kind === 'optic') return { score: 0, labels: [], peregrine: false };   // the outer planets have no essential dignity
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
  function planetaryHour(t, obs, loc, full) {
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
    let isDay, start, len, idx, next = null;
    if (t.ut < set.ut) {
      isDay = true; start = rise.ut; len = (set.ut - rise.ut) / 12; idx = Math.floor((t.ut - start) / len);
    } else {
      next = A.SearchRiseSet(S, obs, +1, set, 1.2);
      if (!next) return fallbackHour(t, loc);
      isDay = false; start = set.ut; len = (next.ut - set.ut) / 12; idx = 12 + Math.floor((t.ut - start) / len);
    }
    idx = Math.max(0, Math.min(23, idx));
    const first = C.CHALDEAN.indexOf(dayRuler);
    const ruler = C.CHALDEAN[(first + idx) % 7];
    let table = null;
    if (full) {                                            // the day's 24 hours, for the readout
      if (!next) next = A.SearchRiseSet(S, obs, +1, set, 1.2);
      const dl = (set.ut - rise.ut) / 12, nl = next ? (next.ut - set.ut) / 12 : dl;
      table = [];
      for (let i = 0; i < 24; i++) {
        const ut = i < 12 ? rise.ut + i * dl : set.ut + (i - 12) * nl;
        table.push({ index: i, ruler: C.CHALDEAN[(first + i) % 7], start: new Date(Date.UTC(2000, 0, 1, 12) + ut * 864e5), isDay: i < 12 });   // ut = days since J2000
      }
    }
    return { dayRuler, hourRuler: ruler, index: idx, isDay, angel: C.PLANETS[ruler].angel, dayAngel: C.PLANETS[dayRuler].angel,
      sunrise: rise.date, sunset: set.date, nextSunrise: next ? next.date : null, hourLengthMin: len * 1440, table };
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
      // a whole-sign aspect that does not hold by sign (29° aries – 1° virgo) is dissociate: half weight
      const wholeSigns = best.asp.angle % 30 === 0 ? best.asp.angle / 30 : null;
      const signDist = Math.min((b.sign - a.sign + 12) % 12, (a.sign - b.sign + 12) % 12);
      const dissociate = wholeSigns !== null && signDist !== wholeSigns;
      let mods = (applying ? 1.2 : 0.8) * (dissociate ? 0.5 : 1);
      if (a.station || b.station) mods *= 1.5;
      if ((a.key === 'sun' || b.key === 'sun') && !(a.key === 'moon' || b.key === 'moon')) mods *= 1.2;
      const sky = (0.2 + 0.8 * rar) * best.asp.weight * (0.3 * Math.pow(exact, 1.5) + 0.7 * windowT) * mods;   // the sky's own weight
      if (a.angular || b.angular) mods *= 1.3;                                                                // local: the horizon turning
      const power = (0.2 + 0.8 * rar) * best.asp.weight * (0.3 * Math.pow(exact, 1.5) + 0.7 * windowT) * mods;
      out.push({
        a: a.key, b: b.key, aspect: best.asp.key, n: best.asp.n, k: best.asp.k, nature: best.asp.nature,
        angle: best.asp.angle, orb: best.orb, orbMax: best.orbMax, exact, applying, rarity: rar, power, sky, days, window: windowT,
        moon: a.key === 'moon' || b.key === 'moon', dissociate, signs: signDist
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
    const tolerable = verdict === 'void' && [1, 3, 8, 11].includes(m.sign);   // lilly: void in taurus, cancer, sagittarius or pisces 'performs somewhat'
    return { next, flags, ripe, verdict, tolerable };
  }

  /* The chord of the moment. Each planet of the two strongest figures sounds the note of the sign it stands in
     (Case's colour–note scale). Three or more notes forming a known chord are named; otherwise the
     figure's two planets give a dyad written lower note first, with the interval named: C–E · major third. */
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
        if (set.join() === pcs.join()) return { name: N[root] + suffix, notes: pcs.map(i => N[i]), planets, root, pcs };
      }
    }
    const ra = st.bodies[figs[0].a].sign, rb = st.bodies[figs[0].b].sign;
    let lo = ra, hi = rb, d = (rb - ra + 12) % 12;
    if (d > 6) { lo = rb; hi = ra; d = 12 - d; }
    const interval = C.INTERVALS[d];
    return { name: d === 0 ? N[lo] : `${N[lo]}–${N[hi]}`, interval, notes: pcs.map(i => N[i]), planets, dyad: true, root: lo, pcs: d === 0 ? [lo] : [lo, hi] };
  }

  /* The three windows: how far the moment serves ideation, incarnation, destruction (0..1).
     The figure's planets and their signs must belong to the mother, the figure's nature must match it,
     and the moment must be beautiful for that work: whole, with harmonious guardians and a ripe moon
     (destruction takes the cut, the clash and the waning moon instead). */
  /* The mode of the moment, one of the three mothers of the Sefer Yetzirah. Aleph, air, ideation while the ruling
     aspect applies: what is coming. Mem, water, manifestation once it is exact and separating: what has landed.
     Shin, fire, destruction when the aspect is hard, the portal is cut by a malefic, or the Moon is void and waning.
     Lilly: an applying aspect shows what is to come, a separating one what is past. The reading of the mothers is [CW]. */
  function modeOf(st) {
    const p = st.configs.primary, cf = st.configs, m = st.moon;
    const malefic = k => k === 'mars' || k === 'saturn' || k === 'pluto';
    if (!p) return { key: m.waxing ? 'ideation' : 'destruction', w: { ideation: m.waxing ? 1 : 0.3, incarnation: 0.3, destruction: m.waxing ? 0.3 : 1 }, quiet: true };
    const hard = p.nature === 'hard' || (p.nature === 'fusion' && (malefic(p.a) || malefic(p.b))) || (cf.cut && malefic(cf.cut.by)) || (m.verdict === 'void' && !m.waxing);
    const signed = (p.applying ? -1 : 1) * (p.days || 0);                    // days to exactness, negative before it
    const t = Math.max(0, Math.min(1, (signed + 0.3) / 0.6));                // the passage from idea to thing, smoothed over ±0.3 day
    const w = hard ? { ideation: 0.3, incarnation: 0.3, destruction: 1 } : { ideation: 0.3 + 0.7 * (1 - t), incarnation: 0.3 + 0.7 * t, destruction: 0.3 };
    const key = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
    return { key, w, quiet: false };
  }
  /* Time to work, to watch, to rest. Rest: the Moon unripe, or void without Lilly's tolerance. Work: the Moon ripe,
     a figure of some strength, and no malefic cutting the portal against a building mode. Watch: everything between. */
  function stateOf(st) {
    const m = st.moon, p = st.configs.primary, cut = st.configs.cut, mode = st.mode.key;
    const malefic = k => k === 'mars' || k === 'saturn' || k === 'pluto';
    if (m.verdict === 'unripe' || (m.verdict === 'void' && !m.tolerable)) return 'rest';
    const against = cut && malefic(cut.by) && mode !== 'destruction';
    if (m.verdict === 'ripe' && p && p.power >= 0.12 && !against) return 'work';
    return 'watch';
  }
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
    if (st.mode) for (const k of Object.keys(out)) out[k] *= st.mode.w[k];   // the mode of the moment leads; the others fall back
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

  /* ---------- synastry: the sky of now against a nativity ----------
     Transiting planets to natal planets and angles: Ptolemaic aspects and the quincunx, tight orbs.
     power = weight × exactness^1.5 × slowness of the transiting planet: a Saturn contact outweighs a Moon contact. */
  const TRANSIT_ORB = { conjunction: 6, opposition: 6, square: 5, trine: 5, sextile: 3, quincunx: 2 };
  function computeTransits(cur, natal) {
    const out = [];
    const targets = [...C.ORDER.map(k => ({ key: k, lon: natal.bodies[k].lon })), { key: 'ascendant', lon: natal.asc }, { key: 'midheaven', lon: natal.mc }];
    for (const tk of C.ORDER) {
      const a = cur.bodies[tk];
      const slow = Math.min(1, Math.log10(C.PLANETS[tk].period) / 5);
      const lum = tk === 'sun' || tk === 'moon' ? 1 : 0;
      for (const n of targets) {
        const d = sep(a.lon, n.lon);
        let best = null;
        for (const asp of C.ASPECTS) {
          if (!TRANSIT_ORB[asp.key]) continue;
          const orbMax = TRANSIT_ORB[asp.key] + lum, orb = Math.abs(d - asp.angle);
          if (orb <= orbMax && (!best || orb < best.orb)) best = { asp, orb, orbMax };
        }
        if (!best) continue;
        const d1 = sep(a.lon + a.speed / 24, n.lon);
        const applying = Math.abs(d1 - best.asp.angle) < best.orb;
        const exact = 1 - best.orb / best.orbMax;
        const power = best.asp.weight * Math.pow(exact, 1.5) * (0.35 + 0.65 * slow) * (applying ? 1.15 : 0.9);
        out.push({ a: tk, b: n.key, natal: true, nlon: n.lon, aspect: best.asp.key, n: best.asp.n, k: best.asp.k, nature: best.asp.nature,
          angle: best.asp.angle, orb: best.orb, orbMax: best.orbMax, exact, applying, power, moon: tk === 'moon' });
      }
    }
    return out.sort((x, y) => y.power - x.power);
  }

  /* ---------- what the two skies make together ----------
     A transiting planet that aspects both ends of a natal aspect sets that aspect off: the native's own strife or
     harmony brought to life. Three aspects close a figure: {trine, trine, trine} a grand trine, {opposition, square,
     square} a t-square, {opposition, trine, sextile} a release. Each figure is scored by the two transits that make it,
     and the whole is summed as harmony against strife. */
  const SOFT = new Set(['trine', 'sextile']), HARD = new Set(['square', 'opposition']);
  const malefic = k => k === 'mars' || k === 'saturn';
  function computeInteractions(cur, natal, transits) {
    const byT = {};
    for (const t of transits) if (C.PLANETS[t.b]) (byT[t.a] = byT[t.a] || []).push(t);
    const figures = [];
    for (const tk in byT) {
      const hits = byT[tk];
      for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
        const x = hits[i], y = hits[j];
        const na = natal.aspects.find(a => (a.a === x.b && a.b === y.b) || (a.a === y.b && a.b === x.b));
        if (!na || !(SOFT.has(na.aspect) || HARD.has(na.aspect) || na.aspect === 'conjunction')) continue;
        const set = [na.aspect, x.aspect, y.aspect].sort().join('+');
        let name = 'setOff', tone;
        if (set === 'trine+trine+trine') { name = 'grandTrine'; tone = 'harmony'; }
        else if (set === 'sextile+sextile+trine') { name = 'minorGrandTrine'; tone = 'harmony'; }
        else if (set === 'opposition+square+square') { name = 'tSquare'; tone = 'strife'; }
        else if (set === 'opposition+sextile+trine') { name = 'release'; tone = 'harmony'; }
        else if (HARD.has(na.aspect)) tone = (HARD.has(x.aspect) || HARD.has(y.aspect) || x.aspect === 'conjunction' || y.aspect === 'conjunction') ? 'strife' : 'harmony';
        else if (SOFT.has(na.aspect)) tone = (HARD.has(x.aspect) && HARD.has(y.aspect)) ? 'strife' : 'harmony';
        else tone = (malefic(tk) || malefic(x.b) || malefic(y.b)) && (HARD.has(x.aspect) || HARD.has(y.aspect) || x.aspect === 'conjunction') ? 'strife' : 'harmony';
        const power = Math.sqrt(x.power * y.power) * (name === 'setOff' ? 1 : 1.3);
        figures.push({ t: tk, a: x.b, b: y.b, natalAspect: na.aspect, x, y, name, tone, power });
      }
    }
    figures.sort((u, v) => v.power - u.power);
    let h = 0, st = 0;
    for (const f of figures) if (f.tone === 'harmony') h += f.power; else st += f.power;
    for (const t of transits) {
      if (!C.PLANETS[t.b]) continue;
      if (SOFT.has(t.aspect)) h += 0.4 * t.power;
      else if (HARD.has(t.aspect) || (t.aspect === 'conjunction' && (malefic(t.a) || malefic(t.b)))) st += 0.4 * t.power;
    }
    const harmony = 1 - Math.exp(-h), strife = 1 - Math.exp(-st);
    const verdict = harmony > strife * 1.25 ? 'harmonyPrevails' : strife > harmony * 1.25 ? 'strifePrevails' : 'balanced';
    return { figures, harmony, strife, verdict };
  }

  /* the element of the sky: the four elements weighed by the bodies' signs, the luminaries and the ascendant heaviest */
  function elements(st) {
    const W = { sun: 3, moon: 3, mercury: 1.5, venus: 1.5, mars: 1.5, jupiter: 1, saturn: 1, uranus: 0.4, neptune: 0.4, pluto: 0.4 };
    const s = { fire: 0, earth: 0, air: 0, water: 0 };
    for (const k in W) s[C.SIGNS[st.bodies[k].sign].element] += W[k];
    s[C.SIGNS[Math.floor(st.asc / 30)].element] += 2.5; s[C.SIGNS[Math.floor(st.mc / 30)].element] += 1;
    const tot = Object.values(s).reduce((a, b) => a + b, 0);
    const shares = {}; for (const k in s) shares[k] = s[k] / tot;
    const order = Object.keys(s).sort((a, b) => s[b] - s[a]);
    return { shares, order, dominant: order[0] };
  }

  /* ---------- the whole state ---------- */
  function compute(date, loc, opts = {}) {
    const t = A.MakeTime(date);
    const obs = new A.Observer(loc.lat, loc.lon, 0);
    const eps = A.e_tilt(t).tobl * D2R;
    const ang = angles(t, loc, eps);
    const houses = opts.houses || 'regiomontanus';
    const cusps = houses === 'equal' ? equalHouses(ang.asc) : houses === 'placidus' ? placidus(ang.ramc, loc.lat, eps, ang.asc, ang.mc) : regiomontanus(ang.ramc, loc.lat, eps, ang.asc, ang.mc);
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
      const angular = Math.min(sep(lon, ang.asc), sep(lon, ang.asc + 180), sep(lon, ang.mc), sep(lon, ang.mc + 180)) < 5;   // conjunct an angle, by longitude
      B[key] = {
        key, lon, speed, retro, station, slow: key === 'sun' || key === 'moon' ? 0 : slow,
        ra, dec, alt: hor.altitude, az: hor.azimuth, H, dsa, p, house: houseIn(cusps, lon), angular,
        sign: signIdx, deg, combust: key !== 'sun' && dSun < 8.5 && dSun >= 0.2833, cazimi: key !== 'sun' && key !== 'moon' && dSun < 0.2833,
        beams: key !== 'sun' && dSun >= 8.5 && dSun < 17,
        oob: Math.abs(dec) > eps * R2D,                    // out of bounds: declination beyond the sun's
        decan: C.decanOf(lon), mansion: C.mansionOf(lon)
      };
    }
    const isDay = B.sun.alt > -0.833;
    for (const key of C.ORDER) B[key].dignity = dignity(key, B[key].sign, B[key].deg, isDay);
    // mutual reception by domicile or by exaltation (Lilly): each planet stands in the other's dignity.
    // Lilly counts it as strengthening; here it lifts the peregrine penalty [CW scoring].
    const seven = C.CHALDEAN;
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
      const a = seven[i], b = seven[j], sa = C.SIGNS[B[a].sign].key, sb = C.SIGNS[B[b].sign].key;
      const byDom = (C.DOMICILE[b] || []).includes(sa) && (C.DOMICILE[a] || []).includes(sb);
      const byEx = C.EXALTATION[b] === sa && C.EXALTATION[a] === sb;
      if (!byDom && !byEx) continue;
      for (const [k, o] of [[a, b], [b, a]]) {
        const D = B[k].dignity;
        D.labels.push(`reception with ${o}`);
        if (D.peregrine) { D.peregrine = false; D.score += 5; D.labels.splice(D.labels.indexOf('peregrine'), 1); }
      }
    }
    for (const key of C.ORDER) {
      const b = B[key];
      let clarity = Math.max(0.18, Math.min(1, 0.62 + b.dignity.score / 16));
      if (b.combust) clarity *= 0.6;
      else if (b.beams) clarity *= 0.85;                  // under the sun's beams: weakened, less than combust
      b.clarity = clarity;
    }
    const phaseAngle = A.MoonPhase(t);
    const moon = { phaseAngle, illum: (1 - Math.cos(phaseAngle * D2R)) / 2, waxing: phaseAngle < 180 };
    const hour = planetaryHour(t, obs, loc, !opts.light);
    const aspects = findAspects(B);
    const events = findEvents(t, B, aspects, opts.light);
    const configs = selectConfigs(aspects, events, B);
    const lunar = moonCondition(B, eps);
    const st = { date, loc, eps, ...ang, bodies: B, sect: isDay ? 'day' : 'night', moon: { ...moon, ...lunar }, hour, aspects, events, configs, cusps, houses };
    st.chord = chordOf(st);
    st.elements = elements(st);
    st.mode = modeOf(st); st.windows = windowsOf(st);
    st.title = { house: st.bodies.moon.house, mode: st.mode.key, state: stateOf(st) };   // the title of the moment: stage of life, mother letter, time to work / watch / rest
    return st;
  }

  CW.engine = { compute, computeTransits, computeInteractions, elements, nextChordShift, norm360, norm180, sep, houseOf, houseIn, mundane, semiArc, dignity, placidus, regiomontanus, equalHouses, synodic, rarity };
})(window.CW = window.CW || {});
