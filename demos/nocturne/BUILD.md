# Nocturne: a hotel for the hours after dark

This session is filmed. Twelve of you build this page at the same time, and a live overlay shows each
of you as a named cursor on the page while you work. The film is shown to an audience deciding whether
agents can make something beautiful. Quality is the goal. Take the time quality needs, inside your
time box.

## The build

A landing page for an invented desert hotel, Nocturne, on a pre-built stage: a dark, empty page with
twelve tagged slots and a shared design system. Each of you owns exactly one slot: its `.jsx` and its
`.css` in `src/sections/`. Read `DESIGN.md` and `src/styles/tokens.css` before you write anything,
and use the tokens for every colour, size, space, radius and duration. Use the shared `.btn`, `.btn--quiet`
and `.reveal` from `global.css` instead of inventing your own, and prefix every CSS class with your
section id. The fonts are already loaded locally; add no font links. Never edit `App.jsx`, the
tokens, `global.css`, `index.html` or anyone else's files. Twelve people with one design system make
one site; twelve people with their own taste make a mess.

The reference is the typical boutique-hotel site: a full-screen stock photo of a pool, a sans-serif
"Escape the ordinary", three rounded cards, and a booking widget that shouts. Its flaw: it could be any
hotel anywhere. Yours belongs to one place and one hour: the desert after dark.

## Why this kind of page works

One thing is the star and the whole page obeys it: here it is the night sky over the dunes, which opens
the page. Every section below is lit by the same moon: cool silver light from the upper left, with warm
lamp light from below only where people gather (the dinner, the rituals). Type and the sky touch: the
hotel name sits in the sky; thin star-points and hairlines recur as ornaments further down. Restraint:
few colours, much dark space, one idea per screen, slow motion.

## The star: the sky (owned by "Night sky")

A full-bleed WebGL2 fragment shader, inside its component, no libraries. Stars at three depths: many
faint far stars, fewer bright near ones with a soft halo; they scintillate (small shifts of brightness
and a hint of colour), they do not blink. A faint dust band crosses the sky diagonally. A thin crescent
moon sits low on the left. Below, three or four layers of dunes as silhouettes whose ridges catch the
cool moonlight as a thin bright rim, with darker, softer layers behind. The sky wheels almost
imperceptibly around a point above the top left of the frame. The pointer moves the dune layers by a
few pixels of parallax. Every 12 to 20 seconds a single meteor draws a short line and fades.

A tiled noise texture is not a night sky, and a scatter of identical white dots is not a star field.

Cost: one full-screen pass, under 6 ms per frame at 1920x1080, device pixel ratio capped at 1.5, a
fixed seed so the sky is the same on every load, paused when the hero is off screen, and a still frame
under `prefers-reduced-motion`.

How the hero is layered: the sky (02) renders `position: absolute; inset: 0; z-index: 0` inside the
`header.hero` (the stage already sets this); the title (03) sits above it at `z-index: 1`. The title must read perfectly on the flat
ground colour alone, in case the sky fails. The sky keeps the title area calmer: fewer, fainter stars
behind the letters.

## Light, colour, type and voice

- The ground is the deep indigo-black of the tokens, never pure black. Silver is the moonlight. The warm
  lamp accent appears in exactly three places: Dining, Rituals and the Hero's call to action. No neon, no
  purple haze, no glassmorphism, no gradient blobs, no grid of dots, no drop-shadowed cards.
- At most one animation per section: on scroll-in only, 600 to 900 ms, opacity and translate only. The
  sky is the only thing that moves all the time.
- Line drawings stay simple and confident: under 40 path elements each.
- Use the two families in the tokens. Real typographic detail: tracked small caps for labels, tabular
  figures for times and prices, true quotes and dashes, generous line height for body.
- Copy: short, exact, a little dry, warm. Banned words: luxury, unparalleled, nestled, oasis, escape,
  curated, unforgettable, experience (as a noun), world-class. Nocturne and everything about it is
  invented, and so is the Kessa Basin; invent freely but never claim real awards, press or reviews.
  Prices are invented, in one currency the Rooms section names once.
- Every image is drawn in code: SVG, CSS or canvas. No external images, no icon fonts, no emoji.
- It must look intentional at 1440 px and at 390 px wide.

## The sections

| Slot | Label | What it holds |
|---|---|---|
| 01-Nav | Nav | Wordmark "Nocturne" in tracked small caps; links: Rooms (`#rooms`), Sky (`#stars`), Dining (`#dining`), The drive (`#drive`), Reserve (`#booking`). Transparent over the sky, one hairline below. |
| 02-HeroSky | Night sky | The star above. Fills the hero behind the title. |
| 03-HeroTitle | Hero | "Nocturne" very large in the display face, set in the sky. One line: "A hotel for the hours after dark." A quiet call to action, "Reserve a night". A small line of facts: Kessa Basin · 1,400 m · 31 rooms. Readable on frame one. |
| 04-Arrival | Arrival | The arrival at dusk, set like a timetable: 17:40 the road ends · 18:10 the lamps are lit · 19:02 first star. Two short paragraphs. |
| 05-Rooms | Rooms | Three rooms: Dune, Courtyard, Observatory. Each with a line drawing in SVG, size in m², bed, view, and one night feature (a roof that opens, a fire, a telescope). Price per night, tabular. |
| 06-StarProgram | Star program | Tonight's program as a table (time, what, where), and a drawn star chart of the basin sky in SVG, stylised, not claimed as exact. |
| 07-Dining | Dining | Dinner by the fire: five courses set like a menu card, warm lamp light from below. |
| 08-Rituals | Rituals | Three rituals for the cold morning and the warm night, each a short title and two lines. |
| 09-TheDrive | The drive | How to get there: a hand-drawn SVG route from the last town, distances and times, what to bring. |
| 10-FieldNotes | Field notes | Three dated entries from the hotel's own night journal, by staff. Not guest reviews. |
| 11-Booking | Booking | A calm reservation panel: dates, guests, room, "Request" (it sends nothing; it shows a quiet confirmation). |
| 12-Footer | Footer | An invented address line, small print, and the last line: "The lamps go out at midnight." |

## Rules that keep the page alive while twelve of you work

- This brief already applies the showcase standard at the scale of one section. Do not load other design
  skills or run longer review loops; follow this brief's process and its 25-tool-call limit.
- Read your two stub files first (the Write tool needs that). Edit nothing else, ever.
- Your file must default-export a component and stay valid after every single Edit: never leave a
  half-finished tag or import. Import only React and your own CSS file. No new packages.
- Keep your section's root element, its `id` and its class from the stub. Your section's height stays
  within 10% of the min-height in `STAGE.md`, so the page does not jump while it is filmed.

## Your process (each agent)

1. Read `DESIGN.md`, the tokens, `STAGE.md` and your two stub files. Spend no more than three tool calls
   on reading.
2. Within your first few tool calls, Write a complete first version of your section, 60 to 120 lines:
   real copy, real layout, tokens only. Then Write your CSS.
3. Then improve it in 4 to 6 separate Edit calls, one idea each, in this order: type and hierarchy,
   then the drawing or signature detail, then spacing and rhythm, then the finest details. Never Write
   the whole file again.
4. Check it at most twice, after your first Edit and after your last: `node tools/shot.mjs <slot id>`
   saves screenshots of your section at 1440 and 390 px into `shots/`. Read them and judge them as a
   harsh art director against the best hotel sites of the year. Screenshots run one at a time; if the
   tool says "waiting", wait, and do not retry.
5. Stop at 25 tool calls in total. Reply in two lines: what you built, and anything that clashes with a
   neighbour.

## Bar

A frozen frame of the hero passes as the launch site of a real hotel that people wait months to book.
The scroll from the sky into the rooms makes you want a night there.
