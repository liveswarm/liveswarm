import "../styles/hero.css";

const C = 200;
const pt = (r, h) => {
  const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const arc = (r, h1, h2) => {
  const [x1, y1] = pt(r, h1);
  const [x2, y2] = pt(r, h2);
  const large = (h2 - h1) / 24 > 0.5 ? 1 : 0;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <div className="hero__badge">
            <b>New</b> Oriel 3 guards your deep-work hours
          </div>
          <h1 className="display hero__title">
            A calendar that <em>defends</em> your best hours.
          </h1>
          <p className="hero__sub">
            Oriel learns when you do your sharpest thinking, then quietly says no to the meetings that would steal it.
          </p>
          <div className="hero__actions">
            <a className="btn btn--solid" href="#start">Start free</a>
            <a className="btn btn--ghost" href="#features">See how it works</a>
          </div>
          <p className="hero__note">Free for 14 days. No card needed.</p>
        </div>

        <div className="hero__dial">
          <svg viewBox="0 0 400 400" role="img" aria-label="A 24 hour dial showing protected focus blocks">
            <circle cx="200" cy="200" r="192" fill="#f7f1e3" stroke="#14231c" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="104" fill="none" stroke="#14231c" strokeOpacity=".15" />
            {Array.from({ length: 48 }).map((_, i) => {
              const h = i / 2;
              const [x1, y1] = pt(i % 2 ? 176 : 170, h);
              const [x2, y2] = pt(182, h);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#14231c" strokeOpacity={i % 2 ? 0.3 : 0.7} />;
            })}
            <path d={arc(150, 9, 12.25)} fill="none" stroke="#2f5d46" strokeWidth="26" strokeLinecap="round" />
            <path d={arc(150, 14, 16)} fill="none" stroke="#f2c14e" strokeWidth="26" strokeLinecap="round" />
            <path d={arc(150, 19.5, 21)} fill="none" stroke="#e8431f" strokeWidth="26" strokeLinecap="round" />
            <path d={arc(118, 10, 11.5)} fill="none" stroke="#14231c" strokeOpacity=".8" strokeWidth="10" strokeLinecap="round" strokeDasharray="1 14" />
            <g className="dial-sweep">
              <line x1="200" y1="200" x2="200" y2="30" stroke="#14231c" strokeWidth="2" />
              <circle cx="200" cy="30" r="6" fill="#14231c" />
            </g>
            <circle cx="200" cy="200" r="9" fill="#14231c" />
            <text x="200" y="262" textAnchor="middle" fontFamily="Iowan Old Style, Palatino, Georgia, serif" fontStyle="italic" fontSize="22" fill="#14231c">deep work</text>
            <text x="200" y="298" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="12" letterSpacing="2" fill="#7a7d6c">3H 15M PROTECTED</text>
          </svg>
          <div className="hero__sticker">
            <small>This week</small>
            11 meetings declined
          </div>
        </div>
      </div>
    </section>
  );
}
