import "./06-StarProgram.css";

const PROGRAM = [
  { time: "19:02", what: "First star, named aloud", where: "Lamp terrace" },
  { time: "20:30", what: "Naked-eye hour, with blankets", where: "East dune" },
  { time: "21:15", what: "Telescope: Saturn and its rings", where: "The Observatory" },
  { time: "22:40", what: "The Milky Way, lamps out", where: "Dry lakebed" },
  { time: "00:00", what: "Quiet. Tea if you want it", where: "Courtyard" },
];

// Stylised, not exact: x, y, radius in a 400 x 400 chart.
const STARS = [
  [92, 118, 2.2], [140, 96, 1.6], [188, 124, 2.6], [236, 100, 1.4],
  [286, 138, 2], [318, 190, 1.5], [270, 232, 2.4], [214, 214, 1.6],
  [150, 250, 2], [104, 214, 1.4], [168, 312, 1.8], [244, 300, 2.2],
  [320, 276, 1.3], [74, 288, 1.5], [200, 56, 1.4], [352, 120, 1.2],
];

const LINES = [
  "M92 118 L140 96 L188 124 L236 100 L286 138",
  "M188 124 L214 214 L270 232 L318 190",
  "M214 214 L150 250 L104 214",
  "M150 250 L168 312 L244 300 L270 232",
];

export default function StarProgram() {
  return (
    <section id="stars" className="stars">
      <div className="container stars__inner">
        <header className="stars__head reveal">
          <p className="stars__eyebrow">06 / Sky</p>
          <h2 className="stars__title">Tonight, <em>overhead</em></h2>
          <p className="stars__lede">
            Nothing is switched on for the stars. We walk you out, turn the lamps down and wait for your eyes.
          </p>
        </header>

        <div className="stars__body">
          <table className="stars__table reveal">
            <caption className="stars__caption">Tonight’s program</caption>
            <thead>
              <tr><th scope="col">Time</th><th scope="col">What</th><th scope="col">Where</th></tr>
            </thead>
            <tbody>
              {PROGRAM.map((r) => (
                <tr key={r.time}>
                  <td className="stars__time">{r.time}</td>
                  <td>{r.what}</td>
                  <td className="stars__where">{r.where}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <figure className="stars__chart reveal">
            <svg viewBox="0 0 400 400" role="img" aria-label="Stylised chart of the Kessa Basin sky, not to scale">
              <circle className="stars__ring" cx="200" cy="200" r="184" />
              <circle className="stars__halo" cx="188" cy="124" r="9" />
              <circle className="stars__ring stars__ring--in" cx="200" cy="200" r="120" />
              <path className="stars__ring" d="M16 200 H384 M200 16 V384" />
              <clipPath id="stars-clip"><circle cx="200" cy="200" r="184" /></clipPath>
              <g clipPath="url(#stars-clip)">
                <path className="stars__dust" d="M0 380 C130 280 270 140 400 40" />
                <path className="stars__dust stars__dust--core" d="M0 380 C130 280 270 140 400 40" />
              </g>
              {LINES.map((d) => (
                <path key={d} className="stars__link" d={d} />
              ))}
              {STARS.map(([x, y, r]) => (
                <circle key={`${x}-${y}`} className="stars__dot" cx={x} cy={y} r={r} />
              ))}
              <text className="stars__mark" x="200" y="9" textAnchor="middle">N</text>
            </svg>
            <figcaption className="stars__figcap">The basin sky, drawn by hand. Stylised, not to scale.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
