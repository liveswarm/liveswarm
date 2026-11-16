import "./09-TheDrive.css";

const STOPS = [
  { name: "Tessel", note: "Last town. Fuel, bread, a signal.", km: "0 km", t: "0:00" },
  { name: "Ash Junction", note: "Turn left at the water tower.", km: "62 km", t: "0:55" },
  { name: "The tarmac ends", note: "Gravel from here. Tyres down to 28.", km: "118 km", t: "1:45" },
  { name: "Dry Ford", note: "Dry nine months in twelve.", km: "151 km", t: "2:25" },
  { name: "Nocturne", note: "The gate, then one lamp.", km: "187 km", t: "3:05" },
];

const BRING = [
  "A coat. It drops to 4 °C by midnight.",
  "A full tank, and the spare.",
  "Shoes you can walk a dune in.",
  "Nothing to charge. The rooms have candles.",
];

export default function TheDrive() {
  return (
    <section id="drive" className="drive">
      <div className="container drive__inner">
        <header className="drive__head">
          <p className="drive__eyebrow">09 / The drive</p>
          <h2 className="drive__title">
            Three hours, and the last one <em>unpaved.</em>
          </h2>
          <p className="drive__lede">
            There is one road to Nocturne and it does not hurry. Leave Tessel
            by two and you arrive as the lamps are lit.
          </p>
        </header>

        <figure className="drive__map reveal">
          <svg viewBox="0 0 720 420" role="img" aria-label="Hand-drawn route from Tessel to Nocturne, 187 kilometres" className="drive__svg">
            <path className="drive__dune" d="M0 330 Q120 270 240 320 T480 300 T720 290 V420 H0Z" />
            <path className="drive__dune drive__dune--near" d="M0 380 Q160 340 300 372 T560 360 T720 350 V420 H0Z" />
            <path className="drive__ridge" d="M0 330 Q120 270 240 320 T480 300 T720 290" />
            <path className="drive__road" d="M60 340 C130 310 150 250 220 250 S300 320 360 280 S430 190 500 200 S600 170 650 110" />
            <path className="drive__gravel" d="M360 280 S430 190 500 200 S600 170 650 110" />
            <g className="drive__pins">
              <circle cx="60" cy="340" r="4" />
              <circle cx="220" cy="250" r="4" />
              <circle cx="360" cy="280" r="4" />
              <circle cx="500" cy="200" r="4" />
              <circle className="drive__home" cx="650" cy="110" r="5" />
            </g>
            <g className="drive__tags">
              <text x="60" y="366" textAnchor="middle">Tessel</text>
              <text x="220" y="234" textAnchor="middle">Ash Junction</text>
              <text x="360" y="306" textAnchor="middle">Tarmac ends</text>
              <text x="500" y="184" textAnchor="middle">Dry Ford</text>
              <text x="650" y="90" textAnchor="middle">Nocturne</text>
            </g>
            <g className="drive__stars">
              <circle cx="90" cy="60" r="1.2" />
              <circle cx="180" cy="110" r="1" />
              <circle cx="300" cy="50" r="1.4" />
              <circle cx="420" cy="90" r="1" />
              <circle cx="560" cy="40" r="1.2" />
            </g>
          </svg>
          <figcaption className="drive__caption">Not to scale. The road is longer than it looks.</figcaption>
        </figure>

        <ol className="drive__legs">
          {STOPS.map((s) => (
            <li className="drive__leg" key={s.name}>
              <span className="drive__time">{s.t}</span>
              <span className="drive__name">{s.name}</span>
              <span className="drive__note">{s.note}</span>
              <span className="drive__km">{s.km}</span>
            </li>
          ))}
        </ol>

        <aside className="drive__bring">
          <h3 className="drive__bring-title">What to bring</h3>
          <ul className="drive__list">
            {BRING.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
