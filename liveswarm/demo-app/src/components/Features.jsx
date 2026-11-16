import "../styles/features.css";

export default function Features() {
  return (
    <section className="features" id="features">
      <div className="wrap">
        <div className="features__head">
          <span className="eyebrow">What Oriel does</span>
          <h2 className="display features__title">Less calendar. More <em>time</em> to think.</h2>
        </div>
        <div className="features__grid">
          <article className="feature feature--wide feature--ink">
            <span className="feature__num">01</span>
            <div className="feature__art">
              <svg viewBox="0 0 320 96" fill="none">
                <rect x="1" y="8" width="318" height="80" rx="14" stroke="#efe6d4" strokeOpacity=".3" />
                <rect x="14" y="22" width="96" height="52" rx="10" fill="#2f5d46" />
                <rect x="122" y="22" width="60" height="52" rx="10" fill="#f2c14e" />
                <rect x="194" y="22" width="112" height="52" rx="10" fill="#e8431f" />
                <path d="M30 48h60M138 48h28M210 48h80" stroke="#efe6d4" strokeWidth="3" strokeLinecap="round" strokeOpacity=".8" />
              </svg>
            </div>
            <h3>Focus blocks that hold the line</h3>
            <p>Oriel finds your sharpest stretches from real usage, then fences them off. Invites that collide get a polite, automatic counter-offer.</p>
          </article>
          <article className="feature">
            <span className="feature__num">02</span>
            <div className="feature__art">
              <svg viewBox="0 0 96 96" fill="none">
                <circle cx="48" cy="48" r="40" stroke="#14231c" strokeWidth="1.5" />
                <path d="M48 48V20M48 48l20 14" stroke="#e8431f" strokeWidth="4" strokeLinecap="round" />
                <circle cx="48" cy="48" r="5" fill="#14231c" />
              </svg>
            </div>
            <h3>Time zones, untangled</h3>
            <p>Every slot shows the fairest hour for everyone on the invite.</p>
          </article>
          <article className="feature">
            <span className="feature__num">03</span>
            <div className="feature__art">
              <svg viewBox="0 0 96 96" fill="none">
                <rect x="10" y="14" width="76" height="68" rx="12" stroke="#14231c" strokeWidth="1.5" />
                <path d="M10 34h76" stroke="#14231c" strokeWidth="1.5" />
                <circle cx="32" cy="54" r="6" fill="#2f5d46" />
                <circle cx="52" cy="54" r="6" fill="#f2c14e" />
                <circle cx="72" cy="54" r="6" fill="#e8431f" />
              </svg>
            </div>
            <h3>One-tap agendas</h3>
            <p>No agenda, no meeting. Oriel asks for one before it says yes.</p>
          </article>
          <article className="feature feature--wide feature--moss">
            <span className="feature__num">04</span>
            <div className="feature__art">
              <svg viewBox="0 0 320 96" fill="none">
                <path d="M4 70C40 70 50 20 90 20s52 56 92 56 50-46 90-46 36 18 46 18" stroke="#efe6d4" strokeWidth="3" strokeLinecap="round" />
                <circle cx="90" cy="20" r="7" fill="#f2c14e" />
                <circle cx="182" cy="76" r="7" fill="#e8431f" />
              </svg>
            </div>
            <h3>A weekly rhythm report</h3>
            <p>See your energy curve, your meeting load and the hours you won back, delivered every Friday in plain language.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
