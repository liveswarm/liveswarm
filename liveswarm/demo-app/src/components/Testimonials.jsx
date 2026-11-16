import "../styles/testimonials.css";

export default function Testimonials() {
  return (
    <section className="quotes" id="stories">
      <div className="wrap">
        <span className="eyebrow">Stories</span>
        <h2 className="display quotes__title">People got their <em>afternoons</em> back.</h2>
        <div className="quotes__grid">
          <figure className="quote">
            <blockquote>&ldquo;We cut recurring meetings by a third in the first month, and nobody missed them.&rdquo;</blockquote>
            <figcaption>
              <span className="quote__av">M</span>
              <div><b>Mara Ellison</b><span>VP Engineering, Halcyon</span></div>
            </figcaption>
          </figure>
          <figure className="quote">
            <blockquote>&ldquo;It declines meetings more politely than I ever could.&rdquo;</blockquote>
            <figcaption>
              <span className="quote__av">J</span>
              <div><b>Jonas Okafor</b><span>Founder, Kestrel</span></div>
            </figcaption>
          </figure>
          <figure className="quote">
            <blockquote>&ldquo;The Friday rhythm report is the only email I read all the way through.&rdquo;</blockquote>
            <figcaption>
              <span className="quote__av">P</span>
              <div><b>Priya Raman</b><span>Design Lead, Fieldnote</span></div>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
