import "../styles/cta.css";

export default function CTA() {
  return (
    <section className="cta" id="start">
      <div className="wrap">
        <div className="cta__card">
          <h2 className="display cta__title">Give your best hours a <em>bodyguard.</em></h2>
          <p className="cta__sub">Join 40,000 people who stopped letting their calendar run their day.</p>
          <form className="cta__form" onSubmit={(e) => e.preventDefault()}>
            <input type="email" placeholder="you@company.com" aria-label="Email address" />
            <button type="submit">Get Oriel</button>
          </form>
        </div>
      </div>
    </section>
  );
}
