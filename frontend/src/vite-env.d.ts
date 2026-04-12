/// <reference types="vite/client" />

// Global constants injected by Vite
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Set to "true" to activate the MSW browser worker in dev mode. */
  readonly VITE_MSW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
