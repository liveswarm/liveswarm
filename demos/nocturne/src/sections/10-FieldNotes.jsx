import "./10-FieldNotes.css";

const ENTRIES = [
  {
    date: "3 March",
    iso: "2026-03-03",
    time: "02:10",
    title: "The roof stayed open",
    body:
      "Wind dropped at one in the morning. We left the Observatory roof back and the room filled with Orion. The guest slept in her coat and asked for nothing.",
    by: "Imen",
    role: "Night porter",
  },
  {
    date: "19 June",
    iso: "2026-06-19",
    time: "23:45",
    title: "A fox at the kitchen door",
    body:
      "Third night running. Same fox, same step, same patience. Tomas leaves the end of the bread. We have agreed not to name it.",
    by: "Tomas",
    role: "Kitchen",
  },
  {
    date: "28 October",
    iso: "2026-10-28",
    time: "04:55",
    title: "Frost on the lamps",
    body:
      "Minus two on the terrace. The lamps wore a thin white skin until the sun cleared the ridge. We lit them again at dusk, as always.",
    by: "Wren",
    role: "Grounds",
  },
];

export default function FieldNotes() {
  return (
    <section id="notes" className="notes">
      <div className="container notes__inner">
        <header className="notes__head reveal">
          <p className="notes__eyebrow">10 / Field notes</p>
          <h2 className="notes__title">From the night <em className="notes__em">journal</em></h2>
          <p className="notes__lede">
            Kept at the front desk, in pencil, by whoever is awake.
          </p>
        </header>

        <ol className="notes__list">
          {ENTRIES.map((e) => (
            <li className="notes__entry reveal" key={e.iso}>
              <time className="notes__date" dateTime={e.iso}>
                <svg className="notes__star" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 0v12M0 6h12" />
                </svg>
                <span className="notes__day">{e.date}</span>
                <span className="notes__time">{e.time}</span>
              </time>
              <div className="notes__body">
                <h3 className="notes__entry-title">{e.title}</h3>
                <p className="notes__text">{e.body}</p>
                <p className="notes__by">
                  {e.by}, {e.role}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
