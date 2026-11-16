import Guard from "./Guard.jsx";
import Nav from "./sections/01-Nav.jsx";
import HeroSky from "./sections/02-HeroSky.jsx";
import HeroTitle from "./sections/03-HeroTitle.jsx";
import Arrival from "./sections/04-Arrival.jsx";
import Rooms from "./sections/05-Rooms.jsx";
import StarProgram from "./sections/06-StarProgram.jsx";
import Dining from "./sections/07-Dining.jsx";
import Rituals from "./sections/08-Rituals.jsx";
import TheDrive from "./sections/09-TheDrive.jsx";
import FieldNotes from "./sections/10-FieldNotes.jsx";
import Booking from "./sections/11-Booking.jsx";
import Footer from "./sections/12-Footer.jsx";

export default function App() {
  return (
    <>
      <Guard><Nav /></Guard>
      <main>
        <header className="hero">
          <Guard><HeroSky /></Guard>
          <Guard><HeroTitle /></Guard>
        </header>
        <Guard><Arrival /></Guard>
        <Guard><Rooms /></Guard>
        <Guard><StarProgram /></Guard>
        <Guard><Dining /></Guard>
        <Guard><Rituals /></Guard>
        <Guard><TheDrive /></Guard>
        <Guard><FieldNotes /></Guard>
        <Guard><Booking /></Guard>
      </main>
      <Guard><Footer /></Guard>
    </>
  );
}
