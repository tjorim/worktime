import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/main.scss";
import { getLocale } from "./paraglide/runtime.js";

// Set the HTML lang attribute based on the current locale
document.documentElement.lang = getLocale();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
