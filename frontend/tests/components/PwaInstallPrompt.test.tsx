import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaInstallProvider } from "@/contexts/PwaInstallContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { PWA_INSTALL_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import * as m from "@/paraglide/messages.js";

const VISIT_THRESHOLD = 3;
const IN_SESSION_DELAY_MS = 20_000;

function dispatchBeforeInstallPrompt(promptSpy: () => Promise<void>) {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  event.prompt = promptSpy;
  event.userChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });
  window.dispatchEvent(event);
}

function seedVisitCount(count: number) {
  window.localStorage.setItem(
    PWA_INSTALL_STATE_STORAGE_KEY,
    JSON.stringify({ visitCount: count - 1, installed: false, lastPromptedAt: null }),
  );
}

function renderPrompt() {
  return render(
    <ToastProvider>
      <PwaInstallProvider>
        <PwaInstallPrompt />
      </PwaInstallProvider>
    </ToastProvider>,
  );
}

describe("PwaInstallPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(PWA_INSTALL_STATE_STORAGE_KEY);
  });

  it("does not show a toast before the engagement visit threshold is met", () => {
    seedVisitCount(1);
    renderPrompt();

    act(() => {
      dispatchBeforeInstallPrompt(vi.fn());
    });
    act(() => {
      vi.advanceTimersByTime(IN_SESSION_DELAY_MS);
    });

    expect(screen.queryByText(m.pwa_install_prompt_message())).not.toBeInTheDocument();
  });

  it("does not show a toast before the in-session delay elapses", () => {
    seedVisitCount(VISIT_THRESHOLD);
    renderPrompt();

    act(() => {
      dispatchBeforeInstallPrompt(vi.fn());
    });
    act(() => {
      vi.advanceTimersByTime(IN_SESSION_DELAY_MS - 1000);
    });

    expect(screen.queryByText(m.pwa_install_prompt_message())).not.toBeInTheDocument();
  });

  it("shows an install toast once engagement, capability, and delay all line up", () => {
    seedVisitCount(VISIT_THRESHOLD);
    const promptSpy = vi.fn().mockResolvedValue(undefined);
    renderPrompt();

    act(() => {
      dispatchBeforeInstallPrompt(promptSpy);
    });
    act(() => {
      vi.advanceTimersByTime(IN_SESSION_DELAY_MS);
    });

    expect(screen.getByText(m.pwa_install_prompt_message())).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: m.pwa_install_now() }));
    expect(promptSpy).toHaveBeenCalledTimes(1);
  });

  it("does not show a toast when the browser never offers an install prompt", () => {
    seedVisitCount(VISIT_THRESHOLD);
    renderPrompt();

    act(() => {
      vi.advanceTimersByTime(IN_SESSION_DELAY_MS);
    });

    expect(screen.queryByText(m.pwa_install_prompt_message())).not.toBeInTheDocument();
  });

  it("does not show a toast again within the cooldown after a prior auto-prompt", () => {
    window.localStorage.setItem(
      PWA_INSTALL_STATE_STORAGE_KEY,
      JSON.stringify({
        visitCount: VISIT_THRESHOLD,
        installed: false,
        lastPromptedAt: new Date().toISOString(),
      }),
    );
    renderPrompt();

    act(() => {
      dispatchBeforeInstallPrompt(vi.fn());
    });
    act(() => {
      vi.advanceTimersByTime(IN_SESSION_DELAY_MS);
    });

    expect(screen.queryByText(m.pwa_install_prompt_message())).not.toBeInTheDocument();
  });
});
