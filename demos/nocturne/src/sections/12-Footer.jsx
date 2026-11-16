import "./12-Footer.css";

const links = [
  { href: "#rooms", label: "Rooms" },
  { href: "#stars", label: "Sky" },
  { href: "#dining", label: "Dining" },
  { href: "#drive", label: "The drive" },
  { href: "#booking", label: "Reserve" },
];

export default function Footer() {
  return (
    <footer id="footer" className="footer">
      <div className="container footer__inner">
        <div className="footer__top reveal">
          <div className="footer__brand">
            <p className="footer__name">Nocturne</p>
            <address className="footer__address">
              Kessa Basin, Hollow Plain
              <br />
              Road 9, km 212 · 1,400 m
            </address>
          </div>

          <nav className="footer__nav" aria-label="Footer">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="footer__link">
                {l.label}
              </a>
            ))}
          </nav>

          <p className="footer__contact">
            Front desk, 17:00–midnight
            <br />
            <span className="footer__tel">+00 555 0142</span>
          </p>
        </div>

        <div className="footer__rule" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="footer__star" focusable="false">
            <path d="M12 2 V22 M2 12 H22" />
            <circle cx="12" cy="12" r="1.6" />
          </svg>
        </div>

        <div className="footer__bottom">
          <p className="footer__small">
            © 2026 Nocturne. An invented hotel; every name and number here is made up.
          </p>
          <p className="footer__last">The lamps go out at midnight.</p>
        </div>
      </div>
    </footer>
  );
}
