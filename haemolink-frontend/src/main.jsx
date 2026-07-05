import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HemoLink from "./HemoLink.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HemoLink />
  </StrictMode>
);
