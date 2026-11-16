import { useState } from "react";
import "./11-Booking.css";

const ROOMS = ["Dune", "Courtyard", "Observatory"];

export default function Booking() {
  const [sent, setSent] = useState(false);
  const [room, setRoom] = useState("Observatory");
  const [guests, setGuests] = useState(2);

  function onSubmit(e) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section id="booking" className="booking">
      <div className="container booking__wrap">
        <header className="booking__intro reveal">
          <p className="booking__eyebrow">11 / Reserve</p>
          <h2 className="booking__title">
            Ask for a night after <em>dark.</em>
          </h2>
          <p className="booking__lead">
            Thirty-one rooms, and the sky is the same from each of them. Tell us when. We write back within a day, usually before the lamps are lit.
          </p>
        </header>

        <div className="booking__panel reveal">
          {sent ? (
            <div className="booking__done" role="status">
              <span className="booking__star" aria-hidden="true" />
              <h3 className="booking__done-title">Received.</h3>
              <p className="booking__done-text">
                We will keep the {room} for you and write by tomorrow evening. Nothing has been charged.
              </p>
              <button type="button" className="btn btn--quiet" onClick={() => setSent(false)}>
                Change the request
              </button>
            </div>
          ) : (
            <form className="booking__form" onSubmit={onSubmit}>
              <div className="booking__row">
                <label className="booking__field">
                  <span className="booking__label">Arrive</span>
                  <input className="booking__input" type="date" name="arrive" required />
                </label>
                <label className="booking__field">
                  <span className="booking__label">Leave</span>
                  <input className="booking__input" type="date" name="leave" required />
                </label>
              </div>

              <div className="booking__field">
                <span className="booking__label">Guests</span>
                <div className="booking__stepper">
                  <button type="button" aria-label="Fewer guests" onClick={() => setGuests(Math.max(1, guests - 1))}>–</button>
                  <output className="booking__count">{guests}</output>
                  <button type="button" aria-label="More guests" onClick={() => setGuests(Math.min(4, guests + 1))}>+</button>
                </div>
              </div>

              <fieldset className="booking__field booking__rooms">
                <legend className="booking__label">Room</legend>
                {ROOMS.map((r) => (
                  <label key={r} className="booking__choice">
                    <input type="radio" name="room" value={r} checked={room === r} onChange={() => setRoom(r)} />
                    <span>{r}</span>
                  </label>
                ))}
              </fieldset>

              <div className="booking__foot">
                <button type="submit" className="btn">Request</button>
                <p className="booking__note">A request, not a charge.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
