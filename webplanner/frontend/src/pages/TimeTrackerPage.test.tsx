import { render, screen } from "@testing-library/react";
import { describe, it } from "vitest";
import { TimeTrackerPage } from "./TimeTrackerPage";

describe("TimeTrackerPage", () => {
  it("renders task manager heading", async () => {
    render(<TimeTrackerPage />);
    expect(await screen.findByText("Task Manager")).toBeInTheDocument();
  });
});
