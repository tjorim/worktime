import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { SettingsBackendStatus } from "@/components/settings/SettingsBackendStatus";
import { server } from "@/mocks/server";
import * as m from "@/paraglide/messages.js";

describe("SettingsBackendStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows when the public backend is available", async () => {
    server.use(http.get("*/api/health", () => HttpResponse.json({ status: "ok" })));
    render(<SettingsBackendStatus />);
    expect(await screen.findByText(m.backend_status_available())).toBeInTheDocument();
  });

  it("shows an unavailable state and allows retrying", async () => {
    let healthy = false;
    const healthCheck = vi.fn(() =>
      healthy ? HttpResponse.json({ status: "ok" }) : new HttpResponse(null, { status: 503 }),
    );
    server.use(http.get("*/api/health", healthCheck));
    const user = userEvent.setup();
    render(<SettingsBackendStatus />);

    expect(await screen.findByText(m.backend_status_unavailable())).toBeInTheDocument();
    healthy = true;
    await user.click(screen.getByRole("button", { name: m.backend_status_refresh() }));
    expect(await screen.findByText(m.backend_status_available())).toBeInTheDocument();
    expect(healthCheck).toHaveBeenCalledTimes(2);
  });

  it("marks a health check unavailable after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );

    render(<SettingsBackendStatus />);
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(screen.getByText(m.backend_status_unavailable())).toBeInTheDocument();
  });
});
