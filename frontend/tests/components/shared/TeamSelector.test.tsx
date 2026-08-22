import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamSelector } from "@/components/shared/TeamSelector";

describe("TeamSelector", () => {
  it("derives teams from the schedule and reports numeric selections", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TeamSelector
        scheduleType="2-shift"
        selectedTeam={1}
        onChange={onChange}
        label="Team"
        ariaLabel="Choose team"
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Choose team" }), "2");

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("honors an explicitly filtered team list", async () => {
    render(
      <TeamSelector
        scheduleType="5-shift"
        selectedTeam={2}
        availableTeams={[2, 4]}
        onChange={vi.fn()}
        label="Other team"
        ariaLabel="Choose other team"
      />,
    );

    expect(screen.getByRole("option", { name: "Team 4" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Team 3" })).not.toBeInTheDocument();
  });
});
