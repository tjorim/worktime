/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Global constants injected by Vite
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Set to "true" to activate the MSW browser worker in dev mode. */
  readonly VITE_MSW?: string;
  /** Optional default MSW scenario id for mock mode. */
  readonly VITE_MSW_SCENARIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
