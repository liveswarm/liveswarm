import "./08-Rituals.css";

const RITUALS = [
  {
    time: "06:10",
    when: "Before sunrise",
    title: "The blanket walk",
    body:
      "A guide hands you wool and a flask of black tea. You walk to the east ridge and wait for the cold to break.",
    glyph: "ridge",
  },
  {
    time: "21:30",
    when: "After dinner",
    title: "Fire and quiet",
    body:
      "The courtyard fire is lit by hand each night. No music, no talk until the first log settles.",
    glyph: "fire",
  },
  {
    time: "23:15",
    when: "Past bedtime",
    title: "The warm stones",
    body:
      "Basalt, heated all day, laid out on the south terrace. Lie back on one and the sky does the rest.",
    glyph: "stones",
  },
];

function Glyph({ kind }) {
  return (
    <svg className="rituals__glyph" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {kind === "ridge" && (
        <g stroke="currentColor" strokeWidth="1" opacity="0.6">
          <path d="M4 48 L22 30 L32 40 L44 22 L60 48 Z" fill="var(--dune)" />
          <path d="M4 56 H60" />
          <circle cx="48" cy="12" r="3" />
          <path d="M48 5 V7 M48 17 V19 M41 12 H43 M53 12 H55" />
        </g>
      )}
      {kind === "fire" && (
        <g>
          <path d="M32 10 C38 22 46 28 42 42 C40 50 24 50 22 42 C20 32 30 28 32 10 Z" stroke="var(--ember)" strokeWidth="1" fill="none" />
          <path d="M12 56 L52 48 M12 48 L52 56" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        </g>
      )}
      {kind === "stones" && (
        <g stroke="currentColor" strokeWidth="1" opacity="0.6">
          <ellipse cx="32" cy="46" rx="22" ry="7" fill="var(--dune)" />
          <ellipse cx="30" cy="36" rx="15" ry="5" fill="var(--dune-deep)" />
          <ellipse cx="34" cy="28" rx="9" ry="3.5" fill="var(--dune)" />
          <path d="M26 12 q6 -6 0 -10 M38 14 q6 -6 0 -10" />
        </g>
      )}
    </svg>
  );
}

export default function Rituals() {
  return (
    <section id="rituals" className="rituals">
      <div className="container rituals__inner">
        <header className="rituals__head reveal">
          <p className="rituals__eyebrow">08 / Rituals</p>
          <h2 className="rituals__title">
            Three small habits for a <em>cold</em> morning and a warm night.
          </h2>
        </header>

        <ol className="rituals__list">
          {RITUALS.map((r) => (
            <li key={r.title} className="rituals__item reveal">
              <div className="rituals__meta">
                <Glyph kind={r.glyph} />
                <time className="rituals__time">{r.time}</time>
                <span className="rituals__when">{r.when}</span>
              </div>
              <h3 className="rituals__name">{r.title}</h3>
              <p className="rituals__body">{r.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
