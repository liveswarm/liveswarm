# Nocturne stage

Blank stage for the Liveswarm demo. App renders 12 slot components in order; sections 02 and 03 sit inside `<header className="hero">` (02 is an absolutely positioned layer behind 03).

Owner rule: an agent edits ONLY its own two files (the `.jsx` and the `.css` of its slot). Never edit App.jsx, styles/, index.html, package.json or another slot. Read DESIGN.md first. Prefix all CSS classes with the section id. Replace the stub entirely; keep the root element, its id and class.

| # | Label | JSX | CSS | Root |
|---|-------|-----|-----|------|
| 01 | Nav | src/sections/01-Nav.jsx | src/sections/01-Nav.css | nav#nav.nav |
| 02 | Night sky | src/sections/02-HeroSky.jsx | src/sections/02-HeroSky.css | section#sky.sky (WebGL canvas, full-bleed, behind 03) |
| 03 | Hero | src/sections/03-HeroTitle.jsx | src/sections/03-HeroTitle.css | section#hero-title.hero-title |
| 04 | Arrival | src/sections/04-Arrival.jsx | src/sections/04-Arrival.css | section#arrival.arrival |
| 05 | Rooms | src/sections/05-Rooms.jsx | src/sections/05-Rooms.css | section#rooms.rooms |
| 06 | Star program | src/sections/06-StarProgram.jsx | src/sections/06-StarProgram.css | section#stars.stars |
| 07 | Dining | src/sections/07-Dining.jsx | src/sections/07-Dining.css | section#dining.dining |
| 08 | Rituals | src/sections/08-Rituals.jsx | src/sections/08-Rituals.css | section#rituals.rituals |
| 09 | The drive | src/sections/09-TheDrive.jsx | src/sections/09-TheDrive.css | section#drive.drive |
| 10 | Field notes | src/sections/10-FieldNotes.jsx | src/sections/10-FieldNotes.css | section#notes.notes |
| 11 | Booking | src/sections/11-Booking.jsx | src/sections/11-Booking.css | section#booking.booking |
| 12 | Footer | src/sections/12-Footer.jsx | src/sections/12-Footer.css | footer#footer.footer |

Layout scaffolding (do not edit): `src/styles/stage.css` gives min-heights (hero 100vh, nav 72px, others 70-90vh); heights may grow with content. In-page nav links should target the ids above (`#rooms`, `#stars`, `#dining`, `#drive`, `#booking`).

Commands: `npm run dev` (127.0.0.1:5175), `npm run build`, `tools/reset.sh` (restore the pristine stage from `.pristine/`).
