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

// CHANGELOG.md as data, served by vite-plugin-changelog.ts (see src/data/changelog.ts).
declare module "virtual:changelog" {
  export interface ChangelogEntry {
    /** `**Scope:**` prefix of the bullet, if any. */
    scope: string | null;
    text: string;
  }
  export interface ChangelogCategory {
    /** The `###` heading; null for bullets before the first heading. */
    name: string | null;
    entries: ChangelogEntry[];
    /** Text under the heading that is not a bullet, e.g. a `#### Title` note. */
    prose?: string;
  }
  export interface ChangelogRelease {
    version: string;
    date: string;
    categories: ChangelogCategory[];
  }
  const changelog: {
    unreleased: { categories: ChangelogCategory[] } | null;
    releases: ChangelogRelease[];
  };
  export default changelog;
}
