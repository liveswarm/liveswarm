import "../styles/footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div className="footer__brand">
            <a className="footer__logo" href="#top">
              <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="16" r="14" fill="#e8431f" />
                <path d="M16 2a14 14 0 0 1 0 28z" fill="#14231c" />
                <circle cx="16" cy="16" r="5" fill="#efe6d4" />
              </svg>
              Oriel
            </a>
            <p>The calendar that protects your best hours. Made slowly in Lisbon and Montreal.</p>
          </div>
          <div className="footer__cols">
            <div>
              <h3>Product</h3>
              <ul><li><a href="#features">Features</a></li><li><a href="#pricing">Pricing</a></li><li><a href="#start">Get Oriel</a></li></ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul><li><a href="#stories">Stories</a></li><li><a href="#top">Back to top</a></li></ul>
            </div>
          </div>
        </div>
        <div className="footer__legal">
          <span>&copy; 2026 Oriel Labs</span>
          <span>Privacy &middot; Terms</span>
        </div>
      </div>
    </footer>
  );
}
