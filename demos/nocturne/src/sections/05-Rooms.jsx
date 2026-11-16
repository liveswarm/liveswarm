import "./05-Rooms.css";

const STROKE = { stroke: "var(--sand)", strokeOpacity: 0.6, strokeWidth: 1, fill: "none", vectorEffect: "non-scaling-stroke" };

function Drawing({ kind }) {
  return (
    <svg className="rooms__draw" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Line drawing of the ${kind} room`}>
      <path d="M0 150 Q70 120 140 140 T320 130 V200 H0Z" fill="var(--dune-deep)" />
      {kind === "Dune" && (
        <g>
          <path d="M60 150 V104 H220 V150" {...STROKE} />
          <path d="M52 104 L140 70 L228 104" {...STROKE} />
          <path d="M120 150 V122 H150 V150" {...STROKE} />
          <path d="M160 104 L190 76" {...STROKE} strokeDasharray="3 4" />
          <circle cx="262" cy="40" r="1.5" fill="var(--star)" />
          <circle cx="292" cy="78" r="1" fill="var(--star)" />
          <circle cx="40" cy="52" r="1" fill="var(--star)" />
        </g>
      )}
      {kind === "Courtyard" && (
        <g>
          <path d="M50 150 V86 H270 V150" {...STROKE} />
          <path d="M110 150 V108 H210 V150Z" {...STROKE} />
          <path d="M160 150 V114" {...STROKE} />
          <path d="M150 128 q10 -22 10 -22 q0 0 10 22 q-10 8 -20 0Z" fill="var(--ember)" />
          <circle cx="60" cy="40" r="1.2" fill="var(--star)" />
          <circle cx="250" cy="52" r="1" fill="var(--star)" />
        </g>
      )}
      {kind === "Observatory" && (
        <g>
          <path d="M90 150 V100 A70 70 0 0 1 230 100 V150" {...STROKE} />
          <path d="M160 30 V100" {...STROKE} />
          <path d="M158 100 L222 54" {...STROKE} />
          <path d="M214 48 l12 10" {...STROKE} />
          <circle cx="40" cy="40" r="1.4" fill="var(--star)" />
          <circle cx="278" cy="34" r="1" fill="var(--star)" />
        </g>
      )}
    </svg>
  );
}

const ROOMS = [
  { name: "Dune", m2: 38, bed: "King bed", view: "The first ridge, west", feature: "A roof that opens above the bed", price: "420" },
  { name: "Courtyard", m2: 52, bed: "King bed and a daybed", view: "A walled garden of stone", feature: "A fire in the room, laid at dusk", price: "560" },
  { name: "Observatory", m2: 44, bed: "Two singles, or one king", view: "The whole basin, 360°", feature: "A telescope on the terrace", price: "680" },
];

export default function Rooms() {
  return (
    <section id="rooms" className="rooms">
      <div className="container">
        <header className="rooms__head reveal">
          <p className="rooms__eyebrow">05 / Rooms</p>
          {/* Moonlight from the upper left lights each drawing */}
          <h2 className="rooms__title">Three rooms, <em>one sky</em></h2>
          <p className="rooms__lead">Thirty-one rooms in all. These are the three we are asked about. Prices are per night, in Kessa crowns (KC).</p>
        </header>
        <ol className="rooms__list">
          {ROOMS.map((r, i) => (
            <li key={r.name} className={`rooms__item rooms__item--${i + 1} reveal`}>
              <Drawing kind={r.name} />
              <div className="rooms__body">
                <h3 className="rooms__name">{r.name}</h3>
                <dl className="rooms__facts">
                  <div><dt>Size</dt><dd>{r.m2} m²</dd></div>
                  <div><dt>Bed</dt><dd>{r.bed}</dd></div>
                  <div><dt>View</dt><dd>{r.view}</dd></div>
                </dl>
                <p className="rooms__night">{r.feature}</p>
                <p className="rooms__price"><span>{r.price}</span> KC a night</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
