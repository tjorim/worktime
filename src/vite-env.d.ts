/// <reference types="vite-plus/client" />

// Global constants injected by Vite
declare const __APP_VERSION__: string;

interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
