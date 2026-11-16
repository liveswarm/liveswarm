import "./04-Arrival.css";

const TIMES = [
  { time: "17:40", what: "The road ends", note: "Gravel gives way to sand. Leave the engine running for the heat." },
  { time: "18:10", what: "The lamps are lit", note: "Thirty-one of them, by hand, along the path to the courtyard." },
  { time: "19:02", what: "First star", note: "Usually Venus, low over the western dune." },
];

export default function Arrival() {
  return (
    <section id="arrival" className="arrival">
      <div className="container arrival__grid">
        <header className="arrival__head reveal">
          <p className="arrival__eyebrow">04 / Arrival &mdash; 17:40</p>
          <h2 className="arrival__title">
            You come in at <em>dusk</em>.
          </h2>
        </header>

        <div className="arrival__copy reveal">
          <p>
            The drive from the last town takes three hours, and the final one is
            the best. The tarmac stops, the light goes copper, then blue, and the
            Hollow Plain opens out on both sides of the car.
          </p>
          <p>
            Someone meets you at the gate with a lamp and a glass of something
            warm. Your bags go ahead. You walk the last two hundred metres, because
            that is how the place is meant to be met.
          </p>
        </div>

        <ol className="arrival__table reveal">
          {TIMES.map((t) => (
            <li className="arrival__row" key={t.time}>
              <time className="arrival__time">{t.time}</time>
              <span className="arrival__what">{t.what}</span>
              <span className="arrival__note">{t.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
