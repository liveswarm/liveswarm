import { useEffect, useState } from "react";
import "./01-Nav.css";

const LINKS = [
  { href: "#rooms", label: "Rooms" },
  { href: "#stars", label: "Sky" },
  { href: "#dining", label: "Dining" },
  { href: "#drive", label: "The drive" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const close = () => setOpen(false);

  return (
    <nav
      id="nav"
      className={"nav" + (scrolled ? " nav--scrolled" : "") + (open ? " nav--open" : "")}
      aria-label="Main"
    >
      <div className="nav__bar">
        <a className="nav__mark" href="#top" aria-label="Nocturne, back to top" onClick={close}>
          Nocturne
        </a>

        <button
          className="nav__toggle"
          type="button"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <ul className="nav__links" id="nav-links" role="list">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a className="nav__link" href={l.href} onClick={close}>
                {l.label}
              </a>
            </li>
          ))}
          <li className="nav__reserve-item">
            <a className="nav__link nav__link--reserve" href="#booking" onClick={close}>
              Reserve
            </a>
          </li>
        </ul>
      </div>
      <span className="nav__rule" aria-hidden="true" />
    </nav>
  );
}
