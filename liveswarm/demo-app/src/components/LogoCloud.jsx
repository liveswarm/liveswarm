import "../styles/logocloud.css";

export default function LogoCloud() {
  return (
    <section className="logos" aria-label="Customers">
      <div className="wrap logos__inner">
        <p className="logos__label">Trusted by calmer teams at</p>
        <div className="logos__row">
          <span className="i">
            <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            Halcyon
          </span>
          <span className="b">NORTHWIND&amp;Co</span>
          <span className="m">kestrel.io</span>
          <span className="i">
            <svg viewBox="0 0 20 20"><path d="M2 16L10 3l8 13z" fill="currentColor" /></svg>
            Fieldnote
          </span>
          <span className="b">Lumen Labs</span>
        </div>
      </div>
    </section>
  );
}
