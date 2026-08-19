import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaInstallProvider, usePwaInstall } from "@/contexts/PwaInstallContext";
import { PWA_INSTALL_STATE_STORAGE_KEY } from "@/constants/storageKeys";

function wrapper({ children }: { children: ReactNode }) {
  return <PwaInstallProvider>{children}</PwaInstallProvider>;
}

function dispatchBeforeInstallPrompt(overrides?: {
  prompt?: () => Promise<void>;
  outcome?: "accepted" | "dismissed";
}) {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  event.prompt = overrides?.prompt ?? vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({
    outcome: overrides?.outcome ?? "accepted",
    platform: "web",
  });
  window.dispatchEvent(event);
  return event;
}

describe("PwaInstallContext", () => {
  afterEach(() => {
    window.localStorage.removeItem(PWA_INSTALL_STATE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it("starts with no install capability and increments visitCount once", () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.visitCount).toBe(1);
  });

  it("persists visitCount across remounts", () => {
    const first = renderHook(() => usePwaInstall(), { wrapper });
    expect(first.result.current.visitCount).toBe(1);
    first.unmount();

    const second = renderHook(() => usePwaInstall(), { wrapper });
    expect(second.result.current.visitCount).toBe(2);
  });

  it("becomes installable after beforeinstallprompt fires, and prompting resolves the outcome", async () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    const promptSpy = vi.fn().mockResolvedValue(undefined);

    act(() => {
      dispatchBeforeInstallPrompt({ prompt: promptSpy, outcome: "accepted" });
    });

    expect(result.current.canInstall).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("accepted");
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it("does not mark installed when the native prompt is dismissed", async () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    act(() => {
      dispatchBeforeInstallPrompt({ outcome: "dismissed" });
    });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("dismissed");
    expect(result.current.isInstalled).toBe(false);
    // The deferred event is spent either way - a new one is needed to prompt again.
    expect(result.current.canInstall).toBe(false);
  });

  it("resolves 'unavailable' when no install prompt has been captured", async () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("unavailable");
  });

  it("marks installed on the native appinstalled event", () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    act(() => {
      dispatchBeforeInstallPrompt();
    });
    expect(result.current.canInstall).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it("records the auto-prompt cooldown timestamp", () => {
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.lastPromptedAt).toBe(null);

    act(() => {
      result.current.recordAutoPromptShown();
    });

    expect(result.current.lastPromptedAt).not.toBe(null);
  });

  it("detects an already-installed standalone display mode", () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(display-mode: standalone)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    expect(result.current.isInstalled).toBe(true);
    matchMediaSpy.mockRestore();
  });
});
