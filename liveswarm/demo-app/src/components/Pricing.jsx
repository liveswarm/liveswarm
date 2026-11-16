import "../styles/pricing.css";

export default function Pricing() {
  return (
    <section className="pricing" id="pricing">
      <div className="wrap">
        <div className="pricing__head">
          <span className="eyebrow">Pricing</span>
          <h2 className="display pricing__title">Simple plans. <em>Honest</em> prices.</h2>
          <p className="pricing__sub">Start free and upgrade when your calendar needs a bodyguard.</p>
        </div>
        <div className="pricing__grid">
          <div className="tier">
            <div className="tier__name">Solo</div>
            <div className="tier__price">$0<span>/ month</span></div>
            <p className="tier__desc">For one person guarding their own mornings.</p>
            <ul className="tier__list">
              <li>Up to 3 focus blocks a week</li>
              <li>Two connected calendars</li>
              <li>Weekly rhythm report</li>
            </ul>
            <a className="btn" href="#start">Start free</a>
          </div>
          <div className="tier tier--hot">
            <div className="tier__name">Studio <span className="tier__tag">Most loved</span></div>
            <div className="tier__price">$12<span>/ seat / month</span></div>
            <p className="tier__desc">For small teams that ship on shared quiet hours.</p>
            <ul className="tier__list">
              <li>Unlimited focus blocks</li>
              <li>Team-wide quiet hours</li>
              <li>Auto counter-offers and agendas</li>
              <li>Priority support</li>
            </ul>
            <a className="btn" href="#start">Try Studio</a>
          </div>
        </div>
      </div>
    </section>
  );
}
