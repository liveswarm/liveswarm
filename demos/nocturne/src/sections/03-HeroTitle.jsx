import "./03-HeroTitle.css";

const FACTS = [
  { k: "Kessa Basin" },
  { k: "1,400 m" },
  { k: "31 rooms" },
];

export default function HeroTitle() {
  return (
    <section id="hero-title" className="hero-title">
      <div className="hero-title__inner">
        <p className="hero-title__eyebrow">Open from dusk</p>
        <h1 className="hero-title__name">Nocturne</h1>
        <span className="hero-title__rule" aria-hidden="true">
          <i className="hero-title__glint" />
        </span>
        <p className="hero-title__line">A hotel for the hours after dark.</p>
        <div className="hero-title__cta">
          <a className="btn" href="#booking">
            Reserve a night
          </a>
        </div>
      </div>
      <ul className="hero-title__facts" aria-label="Facts">
        {FACTS.map((f, i) => (
          <li key={f.k} className="hero-title__fact">
            {i > 0 && (
              <span className="hero-title__sep" aria-hidden="true">
                ·
              </span>
            )}
            {f.k}
          </li>
        ))}
      </ul>
    </section>
  );
}
