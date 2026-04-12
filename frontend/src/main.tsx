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

/**
 * Activates the MSW browser worker when `VITE_MSW=true` is set.
 * Resolves immediately in all other cases so the normal startup path is
 * unaffected in production and CI.
 */
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_MSW !== "true") return;

  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "warn" });
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const rootContainer = container;

async function startApp(): Promise<void> {
  try {
    await enableMocking();
  } catch (error) {
    console.error("MSW failed to start:", error);
  }

  const root = createRoot(rootContainer);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void startApp();
