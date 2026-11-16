# Nocturne: design brief (read before you touch your section)

Nocturne is a small, expensive desert hotel that is only really alive after dark. The site should feel like walking out of a lit room into a cold, huge, quiet night: hushed, spacious, warm only where a lamp burns. Luxury here means restraint, space and one perfect detail per screen. Not features.

## Palette (use tokens from `src/styles/tokens.css`, never raw hex)
- Midnight Ink `--ground` #07060f: page ground. Dusk Well `--ground-2` #0d0b1c: alternate section ground. Indigo Hour `--ground-3` #15122b: cards and panels.
- Moonlit Sand `--sand` #e8ddc8: main text. Dune Shadow `--sand-dim` #a89f8d: secondary. Cold Ash `--sand-faint` #6b6558: captions.
- Star White `--star` #f6f4ee: tiny glints and the hotel name only.
- Lamp Ember `--ember` #e0894a: the ONLY accent. One or two touches per section (a rule, a flame, a button, a single word). Never a large fill, never a gradient wash.
- Dune Violet `--dune` #2a2342 and `--dune-deep` #1a1530: illustration shapes, far and near layers.
- Hairlines: `--line`. Always 1px.

## Type
- Display: Cormorant Garamond (300-600, italic available). Headings, big numerals, pull lines. Large and light; weight 300-400 at big sizes. Italic for a single emphasised word per heading at most.
- Body: Albert Sans (300-600). Paragraphs, labels, buttons.
- Scale: `--text-xs` eyebrows (uppercase, `--track-eyebrow`), `--text-sm` small print, `--text-base` body, `--text-lg` lead, `--text-xl` card titles, `--text-2xl` section headings, `--text-3xl` big statements, `--text-hero` hotel name (hero only).
- Body measure 60-68 characters. Never centre long paragraphs. Every section opens with an eyebrow (e.g. "02 / Rooms") then a display heading.

## Spacing and layout
- Use `--space-*` and `--section-pad` for vertical rhythm; wrap content in `.container` (or `.container--narrow`). Generous empty space is the luxury. Fewer, larger things.
- Asymmetric compositions beat centred stacks: offset columns, a wide illustration against a narrow text column.
- Radii: `--radius-sm`/`--radius-md` mostly; cards are barely rounded. No pill-shaped chips except small tags.
- Must work from 360px to 1600px wide.

## Motion
- Slow, soft, one idea per section. Use `--ease-out` for entrances, `--ease-in-out` for loops, durations `--dur-med` to `--dur-reveal`. Fade + 12-24px rise, or a line drawing itself (stroke-dashoffset). Nothing bounces, spins or pops.
- Ambient loops (twinkle, flicker, drift) must be subtle and cheap (CSS, transform/opacity only). The global reduced-motion rule is already in place; do not fight it.
- No scroll-jacking. Hover states are quiet: colour or underline shifts, 180ms.

## Banned looks
Purple-to-blue gradient washes; glassmorphism blur cards; neon glow; emoji; stock-photo rectangles or grey placeholder boxes (draw with SVG/CSS instead); fake guest reviews or fake star ratings; centred marketing copy in every section; three identical icon cards; Inter/system look; drop-shadow stacks; any text below 12px; any external image or font other than the two loaded in index.html. Do not use ember in more than two places per section.

## Making twelve sections one site
- Every section is full-width and lives on `--ground` or `--ground-2` (odd sections ground, even ground-2; hero and footer ground). Soften seams with a 1px `--line` or a transparent-to-ground fade. Never a hard coloured band.
- Illustration language: flat silhouettes in `--dune` / `--dune-deep` with fine `--sand` hairline strokes (1px, 0.6 opacity), stars as tiny dots, one ember point of warmth. All drawn inline as SVG.
- Voice: short, concrete, quiet sentences. Present tense. Specifics (hours, temperatures, distances) over adjectives. The hotel is Nocturne, on the invented Hollow Plain, a three-hour drive from the nearest town. All people and numbers are invented.
- Section ids are fixed (see STAGE.md). Each section is one root element with its id and class; style only inside your own class names (prefix every class with your section id, e.g. `.rooms__card`) so nothing leaks.
- Only edit your own two files. Use tokens, never redefine them. Do not add dependencies.

## Shared pieces (use these, do not reinvent)
- Button: `.btn` (ember hairline border, transparent fill, sand text, 14px tracked uppercase, hover fills ember with ground text). `.btn--quiet` is a sand hairline with no ember. One `.btn` per section at most.
- Card: `--ground-3` fill, 1px `--line` border, no shadow.
- Entrance: add class `reveal` to an element; it fades and rises 16px once, 700ms. Do not write your own scroll-reveal scripts.
- Second tone: `--sand-dim` and `--dune` may carry emphasis so ember stays rare; vary layout (split, offset, full-bleed), not just colour.
- Fonts are self-hosted in public/fonts (latin subset). Do not add font links.
