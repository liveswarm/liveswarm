import "./07-Dining.css";

const courses = [
  { n: "i", name: "Salt bread, goat butter", note: "Baked in the embers while you sit down." },
  { n: "ii", name: "Charred carrot, smoked yoghurt", note: "Cumin seed, dried lime, a little honey." },
  { n: "iii", name: "Lentil broth with preserved lemon", note: "Poured at the table, very hot." },
  { n: "iv", name: "Fire-roasted lamb, wild thyme", note: "From the Kessa Basin, cooked for six hours." },
  { n: "v", name: "Dates, cardamom cream", note: "Eaten with a blanket over the knees." },
];

export default function Dining() {
  return (
    <section id="dining" className="dining">
      <div className="container dining__wrap">
        <header className="dining__intro reveal">
          <svg className="dining__flame" viewBox="0 0 24 40" width="24" height="40" aria-hidden="true">
            <path d="M12 2 C 18 12 21 18 21 26 A 9 9 0 0 1 3 26 C 3 20 7 16 8 11 C 10 14 11 15 12 2 Z" fill="none" stroke="var(--ember)" strokeWidth="1" />
            <path d="M12 20 C 15 25 16 27 16 30 A 4 4 0 0 1 8 30 C 8 27 10 25 12 20 Z" fill="var(--ember)" opacity="0.7" />
          </svg>
          <p className="dining__eyebrow">07 / Dining</p>
          <h2 className="dining__title">Dinner by the <em>fire</em></h2>
          <p className="dining__lead">
            One table, one fire, five courses. We cook outside because the
            kitchen is too warm for the night, and the night is the point.
          </p>
          <p className="dining__small">
            Served at 20:30 &mdash; 22:00. Tell us what you do not eat when you reserve.
          </p>
        </header>

        <article className="dining__card reveal" aria-label="Tonight's menu">
          <p className="dining__card-head">The menu &middot; tonight</p>
          <ol className="dining__list">
            {courses.map((c) => (
              <li className="dining__course" key={c.n}>
                <span className="dining__num">{c.n}</span>
                <div>
                  <h3 className="dining__name">{c.name}</h3>
                  <p className="dining__note">{c.note}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="dining__card-foot">
            <span>Five courses</span>
            <span>95 per guest</span>
          </p>
        </article>
      </div>
    </section>
  );
}
