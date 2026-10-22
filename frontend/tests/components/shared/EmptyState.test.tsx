import { InboxIcon } from "lucide-react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EmptyState } from "@/components/shared/EmptyState";

describe("EmptyState", () => {
  it("renders the title as a heading with its description", () => {
    render(<EmptyState icon={InboxIcon} title="Nothing here" description="Add something first" />);

    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Add something first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the call to action and calls its handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={InboxIcon}
        title="Nothing here"
        description="Add something first"
        ctaButton={{ label: "Add one", onClick }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add one" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
