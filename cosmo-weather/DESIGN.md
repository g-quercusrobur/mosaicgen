# cosmo weather — system book

A cosmic clock. It renders the sky of the moment as an instrument: the frame is Bauhaus, the content is the trip.
Every mark on the dial is computed from the sky by a stated rule. Nothing is ornament.

---

## 1 · Principles

1. **Austere frame, maximal content.** Grid, type and interface are strict and colourless. Everything inside the circle is computed light.
2. **One variable, one channel.** No astrological factor drives more than one visual channel, and no channel takes more than one factor.
3. **One authority per channel.** Golden Dawn decides colour. The Bauhaus (Itten, Albers) decides structure and colour harmony. Lilly decides dignity.
4. **Traceable.** Any mark can be explained from the readout. The readout is part of the product.
5. **Earned excess.** Stars, mandalas and portals appear only when the sky produces them.

## 2 · Channel map

| factor | channel | rule |
|---|---|---|
| moon phase | global exposure, line weight | exposure 0.62–1.0, lines ×1.5–2.6 from new to full |
| sect (day / night) | which light leads the field | day: sun .45 · asc .30 · moon .25 — night: moon leads |
| sun, moon, ascendant signs | the field | three coloured lights at their real positions, midnight between |
| essential dignity | chroma (clarity) | clarity = 0.62 + score/16, floor 0.18. never brightness |
| combust | bleach | core pulled toward pale gold |
| cazimi | white-gold ring | within 17′ of the sun |
| aspect | geometry {n/k} + colour law | see §5 |
| retrograde / slowness | blur of the primitive the planet owns | see §6 |
| station | the planet's number as hour-marks around the portal | pluto: an unbroken dark ring |
| outer planets | optics | uranus iridescence · neptune brilliance and diffusion · pluto lensing |
| day ruler + hour ruler | the pole | tinctures mixed as light |
| houses | the container | twelve faces of the dodecagon, fixed to horizon and meridian |

## 3 · Correspondences

**Planets — heraldic tinctures, which agree with the GD Queen scale of the Sephiroth.**

| planet | tincture | metal | sephira | number | angel |
|---|---|---|---|---|---|
| sun | or, gold | gold | tiphareth | 6 | michael |
| moon | argent, silver | silver | yesod | 9 | gabriel |
| mercury | purpure | quicksilver | hod | 8 | raphael |
| venus | vert | copper | netzach | 7 | anael |
| mars | gules | iron | geburah | 5 | samael |
| jupiter | azure | tin | chesed | 4 | sachiel |
| saturn | sable, black | lead | binah | 3 | cassiel |
| uranus | — iridescence | — | chokmah | 2 | — |
| neptune | — brilliance | — | kether | 1 | — |
| pluto | — lensing | — | daath | none | — |

Outer planets follow Dion Fortune. They have no pigment: they are optics, which is also true to the eye.
White is reserved for constellation stars.

**Signs — GD King scale of the paths = Itten's twelve-step circle** (used in the field and in planet auras, never as a ring on the frame). Aries scarlet → red-orange → orange → amber → yellow → yellow-green → emerald → green-blue → blue → indigo → violet → Pisces **ultraviolet** (red-violet rendered dark, with a blacklight glow). Golden Dawn letter order; no Crowley swaps. Colour holds flat across a sign and cross-fades over 2° at each cusp.

**Elements (where needed).** fire flame-scarlet · water deep blue · air bright pale yellow · earth citrine, olive, russet, black.

**Dignity (Lilly).** domicile +5 · exaltation +4 · triplicity +3 (Ptolemaic day/night) · term +2 (Egyptian) · face +1 (Chaldean) · detriment −5 · fall −4 · peregrine −5. Outer planets: modern domicile and detriment only.

## 4 · The instrument

- **Container.** A dodecagon, Saturn's black, edged in lead. Twelve sides hold every Ptolemaic aspect as a vertex subset (2, 3, 4, 6, 12). Quintiles and septiles do not fit it and look foreign against it, which is correct.
- **Houses.** Vertices are cusps and faces are houses: ascendant on the left vertex, MC on the top vertex. The frame is fixed to the observer's horizon. It does not turn.
- **Rete.** A monochrome chapter ring: degree ticks and sign glyphs in off-white, rotated so the ascendant degree sits on the eastern horizon. Planet notches in their tinctures mark true longitude. Sign colour never appears on the frame; it lives in the field and the auras.
- **Sky.** Planets are placed in their real local sky. The angle is the Placidian mundane position, the same unequal division as the planetary hours: rising on the left, culminating at the top, setting on the right. The radius is the altitude. The noon sun stands high in summer and low in winter, as on the Prague Orloj. Below the horizon the sun is switched off.
- **Portal.** The inner disc, half the sky's radius, centred on the pole. Mandalas live here and only here.
- **Pole.** The axis. Coloured by the day ruler and the hour ruler.

## 5 · Mandalas

An aspect is a fraction of the circle: angle = k·360/n → the star polygon {n/k}.

| aspect | {n/k} | figure |
|---|---|---|
| conjunction | 1 | rose of P petals, P = sum of the two planets' numbers (sun 6 + venus 7 = 13) |
| opposition | {2/1} | vesica piscis on the axis |
| trine | {3/1} | triangle |
| square | {4/1} | square |
| sextile | {6/1} | hexagram, seed of life when soft |
| quintile / biquintile | {5/1} {5/2} | pentagon / pentagram |
| septiles | {7/1} {7/2} {7/3} | heptagons |
| semisquare / sesquisquare | {8/1} {8/3} | octagons |
| quincunx | {12/5} | twelve-point star |

**Hardness.** Soft aspects bow their edges into petals and add a circle chain through the pole. Hard aspects keep straight edges with points at the vertices. Benefics (venus, jupiter) soften; malefics (mars, saturn, pluto, uranus) sharpen.

**Rose engine.** The primary figure is wrapped in a guilloché band: 5 to 9 passes of r(θ) = R·(1 − a + a·f(Pθ)), where f morphs from a cosine (round petals) to a cusp (spikes) with hardness. A second band at 2P, counter-phased, makes the moiré.

**Colour law (Itten chords).**
- soft, fusion, creative: **light**. Additive, interpolated in OKLab.
- hard: **pigment**. Multiplicative in linear RGB, chroma pulled down. Mud.
- anything mixed with saturn goes black. Black figures are drawn as grooves carved into the light, edged by the other planet's colour.
- pluto lends no pigment; it bends the space instead.

**Orientation.** Vertex zero points at the first planet's true longitude on the rete. Rotation comes from the sky, never from a design choice.

**Constellations.** Figures share the portal at the same radius. Only where vertices of two figures coincide: a white star with a diffraction cross. Plain edge crossings do not count (tested: they read as beads). Major stars are joined by a hairline: the figure of the day. Two centred, aligned figures share gcd(n₁, n₂) vertices.

## 6 · Blur: what each planet owns

| planet | primitive | when slow or retrograde |
|---|---|---|
| mercury | rays, spokes, radial lines | outgoing strokes smear |
| venus | curves: petals, circle chains, the Harris weave | curves soften |
| mars | points and straight star edges | points dull |
| jupiter | halos | rings haze |
| saturn | the container's inner edge | the rim turns porous |
| uranus | iridescence | slows |
| neptune | global diffusion | **inverted**: diffusion withdraws, the field sharpens |
| pluto | lensing | weakens |

Blur is full while retrograde and ramps in as a direct planet slows toward its station, so the shadow period is visible.

## 7 · Hierarchy

power = (0.2 + 0.8 · rarity) × aspect weight × (0.3 · exactness^1.5 + 0.7 · window) × modifiers

- **rarity** = log of the pair's synodic period, from the moon (a month) to neptune–pluto (492 years), normalized.
- **window** is measured in time, not degrees: exp(−½(days to exact / 1.5)²). Slow pairs linger in orb for years. They open the portal only in the days around an exact pass.
- **aspect weights** conjunction 1.0 · opposition .9 · square .8 · trine .7 · sextile .5 · quincunx .35 · minor .26–.32
- **modifiers** applying ×1.2, separating ×0.8, station ×1.5, sun involved ×1.2, angular ×1.3
- **events override:** eclipse > lunation > cazimi > outer-planet exact > station
- **the moon ripples, it never opens a portal alone.** Its strongest aspect is the expanding ring at the pole.
- one primary figure, at most two secondary figures. Below 0.25 the primary shrinks: a quiet sky.

## 8 · Field

A colour field, not a texture. Three lights over midnight: the ascendant from the eastern horizon, the sun and the moon at their real positions, each in its sign colour and weighted by sect. Below the horizon the field is slightly darker: under the earth. No noise, no smoke, no photographs. Every structure inside the circle is computed geometry.

Rejected and why: a noise nebula (encodes nothing) and a planetary interference field (nine summed wave sources look like random blobs, so it reads as noise anyway). Both remain reachable for comparison with `?field=smoke`.

**Harris weave.** The pencil of circles of the two luminaries: the circles through both, and the Apollonian circles separating them. Projective geometry in the manner of Frieda Harris's Thoth backgrounds, computed from where the sun and moon actually stand. At new moon it collapses into rings; through the month it opens.

## 9 · Type and grid

- **Jost** (Google Fonts, OFL) for all text. **IBM Plex Mono** (OFL) for degrees, numerals and the readout.
- Lowercase throughout, as the Bauhaus wrote from 1925.
- The interface owns one colour, off-white `#ebe7dc` at three opacities. All other colour belongs to the sky.
- The square master is 2048 px. The dial is centred at 45% of the height. The caption band sits on a hairline at the bottom, with 6.25% margins.
- Motion is clockwork: ticks and steady rotation, no bounce.

## 10 · Caption (almanac)

```
thursday · 15 october 2026 · 07:00 gmt · greenwich          cosmo weather
day of jupiter · hour of jupiter · angel of the hour sachiel      mars trine saturn
sun in the 12th house · 21°56′ libra                              moon 20% waxing
```

Angels of the days and hours from the Heptameron: michael, gabriel, samael, raphael, sachiel, anael, cassiel. Planetary hours are unequal, counted from local sunrise and sunset in Chaldean order.

## 11 · Output

- **Free:** 2048 × 2048 PNG with the caption, which is a signature that travels with every repost.
- **Paid (proposed):** 4096 / 8192 and the SVG geometry layer. Available now behind `?hd=1` for testing.
- **Daily post:** Greenwich, rendered at sunrise.

## 12 · Open

- hour names (Yayn, Janor …): spellings differ between sources. Verify against an edition before adding.
- Shem HaMephorash angel of the sun's quinance.
- Tree of Life mode, natal/synastry ring, aspects to the angles.
- SVG export of the geometry layer.
