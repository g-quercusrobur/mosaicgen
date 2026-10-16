/*  cosmo weather — language
    English and Spanish. Lowercase throughout, as the frame is. Names of angels, mansions, chords and
    the wordmark stay as they are. The Book T titles are translated plainly; the originals are in the about page.
*/
(function (CW) {
  'use strict';
  const D = {
    en: {
      locale: 'en-GB',
      planets: { sun: 'sun', moon: 'moon', mercury: 'mercury', venus: 'venus', mars: 'mars', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune', pluto: 'pluto', ascendant: 'ascendant', midheaven: 'midheaven' },
      signs: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
      aspects: { conjunction: 'conjunction', opposition: 'opposition', square: 'square', trine: 'trine', sextile: 'sextile', quincunx: 'quincunx', sesquisquare: 'sesquisquare', semisquare: 'semisquare', quintile: 'quintile', biquintile: 'biquintile', septile: 'septile', biseptile: 'biseptile', triseptile: 'triseptile', novile: 'novile' },
      aspectShort: { opposition: 'opp', square: 'sq', trine: 'tri', sextile: 'sxt', quincunx: 'qx', semisquare: '45/135', quintile: 'quint', septile: 'sept' },
      dignity: { domicile: 'domicile', detriment: 'detriment', exaltation: 'exaltation', fall: 'fall', triplicity: 'triplicity', term: 'term', face: 'face', peregrine: 'peregrine', reception: 'reception with' },
      flags: { retrograde: 'retrograde', stationary: 'stationary', cazimi: 'cazimi', combust: 'combust', beams: 'under the beams', 'via combusta': 'via combusta', 'void of course': 'void of course', noDignity: 'no essential dignity', outOfSign: 'out of sign', oob: 'out of bounds' },
      verdict: { ripe: 'ripe', open: 'open', unripe: 'unripe', void: 'void' },
      windows: { ideation: 'ideation', incarnation: 'incarnation', destruction: 'destruction' },
      intervals: { unison: 'unison', 'minor second': 'minor second', 'major second': 'major second', 'minor third': 'minor third', 'major third': 'major third', 'perfect fourth': 'perfect fourth', tritone: 'tritone' },
      suits: { wands: 'wands', cups: 'cups', swords: 'swords', pentacles: 'pentacles' },
      numbers: ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
      of: 'of',
      titles: {
        wands: { 2: 'lord of dominion', 3: 'lord of established strength', 4: 'lord of perfected work', 5: 'lord of strife', 6: 'lord of victory', 7: 'lord of valour', 8: 'lord of swiftness', 9: 'lord of great strength', 10: 'lord of oppression' },
        cups: { 2: 'lord of love', 3: 'lord of abundance', 4: 'lord of blended pleasure', 5: 'lord of loss in pleasure', 6: 'lord of pleasure', 7: 'lord of illusionary success', 8: 'lord of abandoned success', 9: 'lord of material happiness', 10: 'lord of perfected success' },
        swords: { 2: 'lord of peace restored', 3: 'lord of sorrow', 4: 'lord of rest from strife', 5: 'lord of defeat', 6: 'lord of earned success', 7: 'lord of unstable effort', 8: 'lord of shortened force', 9: 'lord of despair and cruelty', 10: 'lord of ruin' },
        pentacles: { 2: 'lord of harmonious change', 3: 'lord of material works', 4: 'lord of earthly power', 5: 'lord of material trouble', 6: 'lord of material success', 7: 'lord of success unfulfilled', 8: 'lord of prudence', 9: 'lord of material gain', 10: 'lord of wealth' }
      },
      trumpSign: ['the emperor', 'the hierophant', 'the lovers', 'the chariot', 'strength', 'the hermit', 'justice', 'death', 'temperance', 'the devil', 'the star', 'the moon'],
      trumpPlanet: { saturn: 'the universe', jupiter: 'the wheel of fortune', mars: 'the tower', sun: 'the sun', venus: 'the empress', mercury: 'the magician', moon: 'the high priestess' },
      events: { eclipse: 'eclipse', lunation: 'lunation', cazimi: 'cazimi', station: 'station', 'outer exact': 'outer planets exact', 'new moon': 'new moon', 'full moon': 'full moon', lunar: 'lunar', solar: 'solar', retrograde: 'retrograde', direct: 'direct' },
      ordinal: n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'),
      decanOrd: ['first', 'second', 'third'],
      cap: {
        nativity: 'nativity', dayOf: 'day of', hourOf: 'hour of', angel: 'angel of the hour', sunIn: 'sun in the', house: 'house', chord: 'chord', decanOf: 'decan of',
        moonIn: 'moon in the', mansion: 'mansion', nextChord: 'next chord', quiet: 'quiet sky', transit: 'transit', natal: 'natal', exact: 'exact',
        moonApplying: 'moon applying', moonVoid: 'moon void of course', to: '', relocated: 'relocated to'
      },
      ui: {
        clock: 'clock', chart: 'chart', natal: 'natal', synastry: 'transits', sigil: 'sigil', listen: 'listen', listening: 'listening', readout: 'readout', screen: 'screen', about: 'about',
        menu: 'menu', view: 'view', settings: 'settings', houses: 'houses', housesOpt: { regiomontanus: 'regiomontanus', equal: 'equal', placidus: 'placidus' },
        field: 'field', fieldOpt: { engraved: 'engraved', glow: 'glow' }, bodiesLabel: 'planets', bodiesOpt: { metal: 'bodies', lights: 'lights' }, language: 'language',
        nativity: 'nativity', noneSet: 'none set', edit: 'edit', seenFrom: 'seen from', birthplace: 'birthplace', currentPlace: 'current place',
        charts: 'saved charts', saveAs: 'save as', rename: 'rename', del: 'delete', confirm: 'confirm', load: 'load', name: 'name', namePrompt: 'a name for this chart', ok: 'ok', noCharts: 'no saved charts yet',
        keys: 'keys', keysNote: 'space run · ← → hour · shift ← → day · f screen · i readout · s sigil · l listen · esc close',
        now: 'now', run: 'run', pause: 'pause', here: 'here', birth: 'birth', save: 'save 2048', saveHd: 'save 4096', wallpaper: 'wallpaper', close: 'close', lang: 'es',
        yourNativity: 'your nativity', kept: 'kept on this device only · never sent anywhere', date: 'date', time: 'time',
        unknown: 'time unknown (noon is used; the houses and the Moon’s degree are then uncertain)', city: 'city of the time zone', placeName: 'place name', placeHint: 'optional, e.g. rome',
        lat: 'latitude', lon: 'longitude', optional: 'optional', saveBtn: 'save', clear: 'clear',
        birthNote: 'The time zone and offset are taken from the city for that date, so the clock keeps the civil time you were given. Latitude and longitude refine the horizon; without them the city’s are used.',
        badDate: 'date as yyyy-mm-dd, time as hh:mm', reading: 'reading the next seven days…', notThisWeek: 'not this week', goTo: 'go to this moment',
        strip: ['now', '+6h', '+12h', '+18h', '+24h'],
        polar: 'polar day or night: equal hours assumed', quietSky: 'quiet sky', noContact: 'no contact within orb',
        h: { bodies: 'bodies', figure: 'the figure', sound: 'sound', tarot: 'tarot', transits: 'transits to the nativity', windows: 'windows', moon: 'moon', hours: 'hours of the day', events: 'events', hierarchy: 'hierarchy', portal: 'portal' },
        r: { voidNote: 'void of course: nothing begun now takes in the world; the guardians still hold the room. inner work, undoing, divination.', figure: 'figure', ring: 'ring', orb: 'orb', applying: 'applying', separating: 'separating', house: 'house', notes: 'notes', from: 'from', next: 'next', at: 'at',
          scale: 'scale', widens: 'jupiter widens, saturn narrows', cut: 'cut by', whole: 'whole', guardians: 'guardians', alone: 'alone: one pure figure', and: 'and',
          nextMoon: 'next', in: 'in', sect: 'sect', day: 'day', night: 'night', hour: 'hour', sun: 'sun', moon: 'moon', ascendant: 'ascendant', dayRuler: 'day', hourRuler: 'hour', mansion: 'mansion' }
      }
    },
    es: {
      locale: 'es-ES',
      planets: { sun: 'sol', moon: 'luna', mercury: 'mercurio', venus: 'venus', mars: 'marte', jupiter: 'júpiter', saturn: 'saturno', uranus: 'urano', neptune: 'neptuno', pluto: 'plutón', ascendant: 'ascendente', midheaven: 'medio cielo' },
      signs: ['aries', 'tauro', 'géminis', 'cáncer', 'leo', 'virgo', 'libra', 'escorpio', 'sagitario', 'capricornio', 'acuario', 'piscis'],
      aspects: { conjunction: 'conjunción', opposition: 'oposición', square: 'cuadratura', trine: 'trígono', sextile: 'sextil', quincunx: 'quincuncio', sesquisquare: 'sesquicuadratura', semisquare: 'semicuadratura', quintile: 'quintil', biquintile: 'biquintil', septile: 'septil', biseptile: 'biseptil', triseptile: 'triseptil', novile: 'novil' },
      aspectShort: { opposition: 'opo', square: 'cuad', trine: 'trig', sextile: 'sext', quincunx: 'quinc', semisquare: '45/135', quintile: 'quint', septile: 'sept' },
      dignity: { domicile: 'domicilio', detriment: 'exilio', exaltation: 'exaltación', fall: 'caída', triplicity: 'triplicidad', term: 'término', face: 'faz', peregrine: 'peregrino', reception: 'recepción con' },
      flags: { retrograde: 'retrógrado', stationary: 'estacionario', cazimi: 'cazimi', combust: 'combusto', beams: 'bajo los rayos', 'via combusta': 'vía combusta', 'void of course': 'vacía de curso', noDignity: 'sin dignidad esencial', outOfSign: 'fuera de signo', oob: 'fuera de límites' },
      verdict: { ripe: 'madura', open: 'abierta', unripe: 'inmadura', void: 'vacía' },
      windows: { ideation: 'ideación', incarnation: 'encarnación', destruction: 'destrucción' },
      intervals: { unison: 'unísono', 'minor second': 'segunda menor', 'major second': 'segunda mayor', 'minor third': 'tercera menor', 'major third': 'tercera mayor', 'perfect fourth': 'cuarta justa', tritone: 'tritono' },
      suits: { wands: 'bastos', cups: 'copas', swords: 'espadas', pentacles: 'oros' },
      numbers: ['', '', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'],
      of: 'de',
      titles: {
        wands: { 2: 'señor del dominio', 3: 'señor de la fuerza establecida', 4: 'señor de la obra perfeccionada', 5: 'señor de la contienda', 6: 'señor de la victoria', 7: 'señor del valor', 8: 'señor de la rapidez', 9: 'señor de la gran fuerza', 10: 'señor de la opresión' },
        cups: { 2: 'señor del amor', 3: 'señor de la abundancia', 4: 'señor del placer mezclado', 5: 'señor de la pérdida en el placer', 6: 'señor del placer', 7: 'señor del éxito ilusorio', 8: 'señor del éxito abandonado', 9: 'señor de la felicidad material', 10: 'señor del éxito perfeccionado' },
        swords: { 2: 'señor de la paz restaurada', 3: 'señor del pesar', 4: 'señor del reposo tras la lucha', 5: 'señor de la derrota', 6: 'señor del éxito ganado', 7: 'señor del esfuerzo inestable', 8: 'señor de la fuerza acortada', 9: 'señor de la desesperación y la crueldad', 10: 'señor de la ruina' },
        pentacles: { 2: 'señor del cambio armonioso', 3: 'señor de las obras materiales', 4: 'señor del poder terrenal', 5: 'señor de la dificultad material', 6: 'señor del éxito material', 7: 'señor del éxito incumplido', 8: 'señor de la prudencia', 9: 'señor de la ganancia material', 10: 'señor de la riqueza' }
      },
      trumpSign: ['el emperador', 'el hierofante', 'los enamorados', 'el carro', 'la fuerza', 'el ermitaño', 'la justicia', 'la muerte', 'la templanza', 'el diablo', 'la estrella', 'la luna'],
      trumpPlanet: { saturn: 'el universo', jupiter: 'la rueda de la fortuna', mars: 'la torre', sun: 'el sol', venus: 'la emperatriz', mercury: 'el mago', moon: 'la sacerdotisa' },
      events: { eclipse: 'eclipse', lunation: 'lunación', cazimi: 'cazimi', station: 'estación', 'outer exact': 'exteriores exactos', 'new moon': 'luna nueva', 'full moon': 'luna llena', lunar: 'lunar', solar: 'solar', retrograde: 'retrógrado', direct: 'directo' },
      ordinal: n => n + 'ª',
      decanOrd: ['primer', 'segundo', 'tercer'],
      cap: {
        nativity: 'natividad', dayOf: 'día de', hourOf: 'hora de', angel: 'ángel de la hora', sunIn: 'sol en la', house: 'casa', chord: 'acorde', decanOf: 'decanato de',
        moonIn: 'luna en la', mansion: 'mansión', nextChord: 'próximo acorde', quiet: 'cielo quieto', transit: 'tránsito', natal: 'natal', exact: 'exacto',
        moonApplying: 'luna aplicando', moonVoid: 'luna vacía de curso', to: 'a', relocated: 'reubicada a'
      },
      ui: {
        clock: 'reloj', chart: 'carta', natal: 'natal', synastry: 'tránsitos', sigil: 'sigilo', listen: 'escuchar', listening: 'escuchando', readout: 'lectura', screen: 'pantalla', about: 'acerca',
        menu: 'menú', view: 'vista', settings: 'ajustes', houses: 'casas', housesOpt: { regiomontanus: 'regiomontanus', equal: 'iguales', placidus: 'placidus' },
        field: 'campo', fieldOpt: { engraved: 'grabado', glow: 'luz' }, bodiesLabel: 'planetas', bodiesOpt: { metal: 'cuerpos', lights: 'luces' }, language: 'idioma',
        nativity: 'natividad', noneSet: 'sin definir', edit: 'editar', seenFrom: 'vista desde', birthplace: 'lugar de nacimiento', currentPlace: 'lugar actual',
        charts: 'cartas guardadas', saveAs: 'guardar como', rename: 'renombrar', del: 'borrar', confirm: 'confirmar', load: 'cargar', name: 'nombre', namePrompt: 'un nombre para esta carta', ok: 'ok', noCharts: 'aún no hay cartas guardadas',
        keys: 'teclas', keysNote: 'espacio correr · ← → hora · mayús ← → día · f pantalla · i lectura · s sigilo · l escuchar · esc cerrar',
        now: 'ahora', run: 'correr', pause: 'pausa', here: 'aquí', birth: 'nacimiento', save: 'guardar 2048', saveHd: 'guardar 4096', wallpaper: 'fondo', close: 'cerrar', lang: 'en',
        yourNativity: 'tu natividad', kept: 'guardada solo en este dispositivo · nunca se envía', date: 'fecha', time: 'hora',
        unknown: 'hora desconocida (se usa el mediodía; las casas y el grado de la luna quedan inciertos)', city: 'ciudad del huso horario', placeName: 'nombre del lugar', placeHint: 'opcional, p. ej. roma',
        lat: 'latitud', lon: 'longitud', optional: 'opcional', saveBtn: 'guardar', clear: 'borrar',
        birthNote: 'El huso y el desfase se toman de la ciudad para esa fecha, así el reloj conserva la hora civil que te dieron. La latitud y la longitud afinan el horizonte; sin ellas se usan las de la ciudad.',
        badDate: 'fecha como aaaa-mm-dd, hora como hh:mm', reading: 'leyendo los próximos siete días…', notThisWeek: 'no esta semana', goTo: 'ir a este momento',
        strip: ['ahora', '+6h', '+12h', '+18h', '+24h'],
        polar: 'día o noche polar: se asumen horas iguales', quietSky: 'cielo quieto', noContact: 'ningún contacto dentro del orbe',
        h: { bodies: 'cuerpos', figure: 'la figura', sound: 'sonido', tarot: 'tarot', transits: 'tránsitos a la natividad', windows: 'ventanas', moon: 'luna', hours: 'horas del día', events: 'eventos', hierarchy: 'jerarquía', portal: 'portal' },
        r: { voidNote: 'vacía de curso: nada que empiece ahora cuaja en el mundo; los guardianes siguen rigiendo la sala. trabajo interior, deshacer, adivinación.', figure: 'figura', ring: 'anillo', orb: 'orbe', applying: 'aplicativo', separating: 'separativo', house: 'casa', notes: 'notas', from: 'de', next: 'siguiente', at: 'a las',
          scale: 'escala', widens: 'júpiter ensancha, saturno estrecha', cut: 'cortada por', whole: 'entera', guardians: 'guardianes', alone: 'solo: una figura pura', and: 'y',
          nextMoon: 'próximo', in: 'en', sect: 'secta', day: 'diurna', night: 'nocturna', hour: 'hora', sun: 'sol', moon: 'luna', ascendant: 'ascendente', dayRuler: 'día', hourRuler: 'hora', mansion: 'mansión' }
      }
    }
  };

  let lang = 'en';
  const d = () => D[lang];
  const I = {
    get lang() { return lang; },
    set(l) { lang = D[l] ? l : 'en'; try { document.documentElement.lang = lang; } catch (e) { /* no document */ } },
    locale: () => d().locale,
    t: key => key.split('.').reduce((o, k) => (o == null ? o : o[k]), d()) ?? key,
    planet: k => d().planets[k] || k,
    sign: i => d().signs[i],
    aspect: k => d().aspects[k] || k,
    aspectShort: k => d().aspectShort[k] || k,
    dignity: label => {
      const m = label.match(/^reception with (\w+)$/);
      if (m) return `${d().dignity.reception} ${I.planet(m[1])}`;
      return d().dignity[label] || label;
    },
    flag: k => d().flags[k] || k,
    verdict: k => d().verdict[k] || k,
    window: k => d().windows[k] || k,
    interval: k => d().intervals[k] || k,
    card: dec => `${d().numbers[dec.num]} ${d().of} ${d().suits[dec.suit]}`,
    title: dec => d().titles[dec.suit][dec.num],
    trumpSign: i => d().trumpSign[i],
    trumpPlanet: k => d().trumpPlanet[k] || k,
    event: k => d().events[k] || k,
    ordinal: n => d().ordinal(n),
    decanOrd: n => d().decanOrd[n - 1],
    /* apply data-i18n="ui.key" to the static page: text, or an attribute named in data-i18n-attr */
    apply(root = document) {
      root.querySelectorAll('[data-i18n]').forEach(el => {
        const v = I.t(el.dataset.i18n), attr = el.dataset.i18nAttr;
        if (attr) el.setAttribute(attr, v); else el.textContent = v;
      });
    }
  };
  CW.i18n = I;
})(window.CW = window.CW || {});
