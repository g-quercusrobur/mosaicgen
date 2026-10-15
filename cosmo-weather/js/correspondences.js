/*  cosmo weather — correspondences
    One authority per channel:
      planet colour   heraldic tinctures / metals (= GD Queen scale, Sephiroth)
      sign colour     GD King scale of the paths = Itten's 12-step circle
      planet number   Sephirah = order of the kamea (Agrippa)
      outer planets   Dion Fortune: Neptune Kether, Uranus Chokmah, Pluto Daath
                      rendered as optics, not pigments
      letters         Golden Dawn order. No Crowley swaps.
      dignities       Lilly: domicile 5, exaltation 4, triplicity 3, term 2, face 1,
                      detriment -5, fall -4, peregrine -5. Egyptian terms. Chaldean faces.
*/
(function (CW) {
  'use strict';

  const SIGNS = [
    { key: 'aries',       name: 'aries',       element: 'fire',  mode: 'cardinal', letter: 'heh',    value: 5,   color: '#e0262c' }, // scarlet
    { key: 'taurus',      name: 'taurus',      element: 'earth', mode: 'fixed',    letter: 'vav',    value: 6,   color: '#e8571c' }, // red-orange
    { key: 'gemini',      name: 'gemini',      element: 'air',   mode: 'mutable',  letter: 'zayin',  value: 7,   color: '#f0891b' }, // orange
    { key: 'cancer',      name: 'cancer',      element: 'water', mode: 'cardinal', letter: 'cheth',  value: 8,   color: '#f4b223' }, // amber
    { key: 'leo',         name: 'leo',         element: 'fire',  mode: 'fixed',    letter: 'teth',   value: 9,   color: '#ece03a' }, // greenish yellow
    { key: 'virgo',       name: 'virgo',       element: 'earth', mode: 'mutable',  letter: 'yod',    value: 10,  color: '#a6cc31' }, // yellow-green
    { key: 'libra',       name: 'libra',       element: 'air',   mode: 'cardinal', letter: 'lamed',  value: 30,  color: '#23a65a' }, // emerald
    { key: 'scorpio',     name: 'scorpio',     element: 'water', mode: 'fixed',    letter: 'nun',    value: 50,  color: '#13938e' }, // green-blue
    { key: 'sagittarius', name: 'sagittarius', element: 'fire',  mode: 'mutable',  letter: 'samekh', value: 60,  color: '#2262d2' }, // blue
    { key: 'capricorn',   name: 'capricorn',   element: 'earth', mode: 'cardinal', letter: 'ayin',   value: 70,  color: '#3b33a6' }, // indigo
    { key: 'aquarius',    name: 'aquarius',    element: 'air',   mode: 'fixed',    letter: 'tzaddi', value: 90,  color: '#7b31ba' }, // violet
    { key: 'pisces',      name: 'pisces',      element: 'water', mode: 'mutable',  letter: 'qoph',   value: 100, color: '#a01c88', glow: '#c63ee6' } // ultraviolet
  ];

  /* kind: 'pigment' (seven classical tinctures) | 'optic' (outer planets) */
  const PLANETS = {
    sun:     { name: 'sun',     kind: 'pigment', tincture: '#e8b54a', metal: 'gold',        sephira: 'tiphareth', number: 6,    angel: 'michael',  body: 'Sun',     period: 365.256, owns: 'radiance' },
    moon:    { name: 'moon',    kind: 'pigment', tincture: '#cdd5df', metal: 'silver',      sephira: 'yesod',     number: 9,    angel: 'gabriel',  body: 'Moon',    period: 27.3217, owns: 'fill' },
    mercury: { name: 'mercury', kind: 'pigment', tincture: '#8f52b8', metal: 'quicksilver', sephira: 'hod',       number: 8,    angel: 'raphael',  body: 'Mercury', period: 365.256, owns: 'rays' },
    venus:   { name: 'venus',   kind: 'pigment', tincture: '#2f9d5c', metal: 'copper',      sephira: 'netzach',   number: 7,    angel: 'anael',    body: 'Venus',   period: 365.256, owns: 'curves' },
    mars:    { name: 'mars',    kind: 'pigment', tincture: '#c9262e', metal: 'iron',        sephira: 'geburah',   number: 5,    angel: 'samael',   body: 'Mars',    period: 686.98,  owns: 'points' },
    jupiter: { name: 'jupiter', kind: 'pigment', tincture: '#2f6fd6', metal: 'tin',         sephira: 'chesed',    number: 4,    angel: 'sachiel',  body: 'Jupiter', period: 4332.59, owns: 'halos' },
    saturn:  { name: 'saturn',  kind: 'pigment', tincture: '#040507', rim: '#4d525c', metal: 'lead', sephira: 'binah', number: 3, angel: 'cassiel', body: 'Saturn', period: 10759.2, owns: 'container' },
    uranus:  { name: 'uranus',  kind: 'optic',   tincture: '#d8e4ee', optic: 'iridescence', sephira: 'chokmah',   number: 2,    body: 'Uranus',  period: 30688.5, owns: 'lattice' },
    neptune: { name: 'neptune', kind: 'optic',   tincture: '#eef3ff', optic: 'brilliance',  sephira: 'kether',    number: 1,    body: 'Neptune', period: 60182,   owns: 'diffusion' },
    pluto:   { name: 'pluto',   kind: 'optic',   tincture: '#1a0f12', optic: 'lensing',     sephira: 'daath',     number: null, body: 'Pluto',   period: 90560,   owns: 'core' }
  };
  const ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const CHALDEAN = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];
  const WEEKDAY_RULER = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn']; // Sunday..Saturday

  /* Synodic periods where geocentric mean motion is shared with the Sun */
  const SYNODIC_OVERRIDE = { 'sun|mercury': 115.88, 'sun|venus': 583.92, 'mercury|venus': 144.56 };

  const DOMICILE = {
    sun: ['leo'], moon: ['cancer'], mercury: ['gemini', 'virgo'], venus: ['taurus', 'libra'],
    mars: ['aries', 'scorpio'], jupiter: ['sagittarius', 'pisces'], saturn: ['capricorn', 'aquarius'],
    uranus: ['aquarius'], neptune: ['pisces'], pluto: ['scorpio']
  };
  const EXALTATION = { sun: 'aries', moon: 'taurus', mercury: 'virgo', venus: 'pisces', mars: 'capricorn', jupiter: 'cancer', saturn: 'libra' };
  const TRIPLICITY = { fire: ['sun', 'jupiter'], earth: ['venus', 'moon'], air: ['saturn', 'mercury'], water: ['mars', 'mars'] }; // [day, night]
  /* Egyptian terms: [ruler, upper bound in degrees] */
  const TERMS = {
    aries:       [['jupiter', 6], ['venus', 12], ['mercury', 20], ['mars', 25], ['saturn', 30]],
    taurus:      [['venus', 8], ['mercury', 14], ['jupiter', 22], ['saturn', 27], ['mars', 30]],
    gemini:      [['mercury', 6], ['jupiter', 12], ['venus', 17], ['mars', 24], ['saturn', 30]],
    cancer:      [['mars', 7], ['venus', 13], ['mercury', 19], ['jupiter', 26], ['saturn', 30]],
    leo:         [['jupiter', 6], ['venus', 11], ['saturn', 18], ['mercury', 24], ['mars', 30]],
    virgo:       [['mercury', 7], ['venus', 17], ['jupiter', 21], ['mars', 28], ['saturn', 30]],
    libra:       [['saturn', 6], ['mercury', 14], ['jupiter', 21], ['venus', 28], ['mars', 30]],
    scorpio:     [['mars', 7], ['venus', 11], ['mercury', 19], ['jupiter', 24], ['saturn', 30]],
    sagittarius: [['jupiter', 12], ['venus', 17], ['mercury', 21], ['saturn', 26], ['mars', 30]],
    capricorn:   [['mercury', 7], ['jupiter', 14], ['venus', 22], ['saturn', 26], ['mars', 30]],
    aquarius:    [['mercury', 7], ['venus', 13], ['jupiter', 20], ['mars', 25], ['saturn', 30]],
    pisces:      [['venus', 12], ['jupiter', 16], ['mercury', 19], ['mars', 28], ['saturn', 30]]
  };
  /* Faces: Chaldean order from Mars at 0° Aries, one per decan */
  const faceRuler = decanIndex => CHALDEAN[(2 + decanIndex) % 7];

  /* Aspects as fractions of the circle: angle = k·360/n  →  star polygon {n/k} */
  const ASPECTS = [
    { key: 'conjunction',  angle: 0,     n: 1,  k: 0, weight: 1.00, orb: 8,   nature: 'fusion' },
    { key: 'opposition',   angle: 180,   n: 2,  k: 1, weight: 0.90, orb: 8,   nature: 'hard' },
    { key: 'square',       angle: 90,    n: 4,  k: 1, weight: 0.80, orb: 7,   nature: 'hard' },
    { key: 'trine',        angle: 120,   n: 3,  k: 1, weight: 0.70, orb: 7,   nature: 'soft' },
    { key: 'sextile',      angle: 60,    n: 6,  k: 1, weight: 0.50, orb: 5,   nature: 'soft' },
    { key: 'quincunx',     angle: 150,   n: 12, k: 5, weight: 0.35, orb: 3,   nature: 'hard' },
    { key: 'sesquisquare', angle: 135,   n: 8,  k: 3, weight: 0.32, orb: 2,   nature: 'hard' },
    { key: 'semisquare',   angle: 45,    n: 8,  k: 1, weight: 0.30, orb: 2,   nature: 'hard' },
    { key: 'quintile',     angle: 72,    n: 5,  k: 1, weight: 0.30, orb: 2,   nature: 'creative' },
    { key: 'biquintile',   angle: 144,   n: 5,  k: 2, weight: 0.30, orb: 2,   nature: 'creative' },
    { key: 'septile',      angle: 360/7, n: 7,  k: 1, weight: 0.28, orb: 1.2, nature: 'fated' },
    { key: 'biseptile',    angle: 720/7, n: 7,  k: 2, weight: 0.28, orb: 1.2, nature: 'fated' },
    { key: 'triseptile',   angle: 1080/7,n: 7,  k: 3, weight: 0.28, orb: 1.2, nature: 'fated' },
    { key: 'novile',       angle: 40,    n: 9,  k: 1, weight: 0.26, orb: 1,   nature: 'creative' }
  ];
  const ASPECT_GLYPH = {
    conjunction: '☌', opposition: '☍', square: '□', trine: '△', sextile: '⚹', quincunx: '⚻',
    sesquisquare: '⚼', semisquare: '∠', quintile: 'Q', biquintile: 'bQ', septile: 'S7', biseptile: 'S7²', triseptile: 'S7³', novile: 'N'
  };

  const BENEFIC = { venus: 1, jupiter: 1, sun: 0.3, moon: 0.4 };
  const MALEFIC = { mars: 1, saturn: 1, pluto: 0.6, uranus: 0.4 };

  CW.corr = {
    SIGNS, PLANETS, ORDER, CHALDEAN, WEEKDAY_RULER, SYNODIC_OVERRIDE,
    DOMICILE, EXALTATION, TRIPLICITY, TERMS, faceRuler, ASPECTS, ASPECT_GLYPH, BENEFIC, MALEFIC
  };
})(window.CW = window.CW || {});
