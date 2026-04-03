import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initSuperTokens } from "./config/supertokens";
import "./styles/main.scss";
import { getLocale } from "./paraglide/runtime.js";

// Guard against double-init during Vite HMR (module re-evaluation)
declare global {
  interface Window {
    __SUPERTOKENS_INITIALIZED__?: boolean;
  }
}

if (!window.__SUPERTOKENS_INITIALIZED__) {
  initSuperTokens();
  window.__SUPERTOKENS_INITIALIZED__ = true;
}

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
