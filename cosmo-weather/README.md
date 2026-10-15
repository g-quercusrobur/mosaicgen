# cosmo weather — prototype

The sky of the moment as an instrument. Open `index.html` in a browser: no build step, no server, works offline except for the fonts.

**Controls:** `now` · `±1h` · `±1d` · `run` (one hour per second) · date field · greenwich / rome / jerusalem / here · clock / chart · readout · screen · save 2048
**Keys:** `space` run · `←/→` hour · `shift+←/→` day · `f` screen · `i` readout · `esc`
**URL:** `?t=2027-01-15T21:00:00Z` fixes the moment · `?place=rome` · `?mode=chart` · `?hd=1` shows the 4096 export

Samples in `samples/`: today at sunrise, the Venus cazimi of 24 Oct 2026, the exact Uranus–Neptune sextile of 15 Jan 2027, and the chart mode.

## Files

| file | role |
|---|---|
| `js/engine.js` | sky → state: positions, Placidian mundane positions, houses, dignity, planetary hours, aspects, hierarchy, events. No drawing. |
| `js/correspondences.js` | the tables: tinctures, King scale, sephiroth, numbers, angels, dignities, terms, faces, aspects |
| `js/color.js` | OKLab; the two mixing laws (light, pigment) |
| `js/glyphs.js` | planet and sign glyphs, drawn from circle, line and arc |
| `js/render.js` | dial, field, Harris weave, rose engine, constellations, optics, caption |
| `js/app.js` | shell: live clock, scrubber, places, export, readout |
| `js/vendor/astronomy.browser.min.js` | Astronomy Engine 2.1.19 (MIT, Don Cross). Ephemeris accurate to about an arcminute. |
| `DESIGN.md` | the system book: every rule the code implements |
