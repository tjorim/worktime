import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import App from "@/App";

describe("HomePage", () => {
  it("renders exactly one main landmark on the home route", async () => {
    localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        hasCompletedOnboarding: true,
        scheduleType: "5-shift",
        myTeam: 1,
      }),
    );
    window.history.pushState(null, "", "/");

    render(<App />);

    expect(await screen.findAllByRole("main")).toHaveLength(1);
  });
});
