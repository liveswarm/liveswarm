import "../styles/nav.css";

export default function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav__inner">
        <a className="nav__logo" href="#top">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="#e8431f" />
            <path d="M16 2a14 14 0 0 1 0 28z" fill="#14231c" />
            <circle cx="16" cy="16" r="5" fill="#efe6d4" />
          </svg>
          Oriel
        </a>
        <nav className="nav__links">
          <a href="#features">Product</a>
          <a href="#pricing">Pricing</a>
          <a href="#stories">Stories</a>
          <a href="#start">Get started</a>
        </nav>
        <a className="nav__cta" href="#start">Get Oriel</a>
      </div>
    </header>
  );
}
