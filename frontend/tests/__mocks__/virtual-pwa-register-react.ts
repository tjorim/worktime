/**
 * Mock for the `virtual:pwa-register/react` module, which vite-plugin-pwa only
 * resolves when its Vite plugin is active. Vitest runs against vitest.config.ts,
 * which doesn't load that plugin, so the real virtual module never exists in tests.
 * PwaUpdateToast never needs a real service worker in tests — this stub keeps
 * needRefresh/offlineReady permanently false so the toast never fires.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
    updateServiceWorker: async () => {},
  };
}
