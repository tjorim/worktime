import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import App from "@/App";

describe("PrivacyPage", () => {
  it("renders the privacy policy route", async () => {
    localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        hasCompletedOnboarding: true,
        scheduleType: "5-shift",
        myTeam: 1,
      }),
    );
    window.history.pushState(null, "", "/privacy");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What Worktime stores" })).toBeInTheDocument();
    expect(screen.getByText(/export your account data as JSON/i)).toBeInTheDocument();
  });
});
