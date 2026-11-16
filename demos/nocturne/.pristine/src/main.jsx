import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/stage.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
