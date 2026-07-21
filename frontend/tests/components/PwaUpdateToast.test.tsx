import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdateToast } from "@/components/PwaUpdateToast";
import { ToastProvider } from "@/contexts/ToastContext";

const updateServiceWorker = vi.fn();
let needRefresh = false;

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

describe("PwaUpdateToast", () => {
  beforeEach(() => {
    needRefresh = false;
    updateServiceWorker.mockClear();
  });

  it("renders nothing when no update is available", () => {
    const { container } = render(
      <ToastProvider>
        <PwaUpdateToast />
      </ToastProvider>,
    );
    expect(container.querySelector(".toast")).not.toBeInTheDocument();
  });

  it("shows a persistent toast with a reload action when an update is available", async () => {
    needRefresh = true;
    render(
      <ToastProvider>
        <PwaUpdateToast />
      </ToastProvider>,
    );

    const reloadButton = await screen.findByRole("button", { name: /reload/i });
    await userEvent.click(reloadButton);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
