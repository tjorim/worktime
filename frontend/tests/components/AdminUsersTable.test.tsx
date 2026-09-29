import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsersTable, type AdminUserRow } from "@/components/settings/admin/AdminUsersTable";

const users: AdminUserRow[] = [
  {
    id: 1,
    username: "zoe",
    display_name: "Zoe Admin",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: 2,
    username: "adam",
    display_name: "Adam Member",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-02T00:00:00Z",
  },
  {
    id: 10,
    username: "mia",
    display_name: "Mia Member",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

function renderTable(props: Partial<Parameters<typeof AdminUsersTable>[0]> = {}) {
  const onRequestDelete = vi.fn();
  render(
    <AdminUsersTable
      users={users}
      currentAccountId={1}
      deletingAdminUserId={null}
      onRequestDelete={onRequestDelete}
      {...props}
    />,
  );
  return { onRequestDelete };
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");

describe("AdminUsersTable", () => {
  it("keeps the server order until a column is chosen", () => {
    renderTable();
    const usernames = bodyRows().map((row) => within(row).getAllByRole("cell")[1]?.textContent);
    expect(usernames).toEqual(["zoe", "adam", "mia"]);
  });

  it("sorts by username and reverses on a second click", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: /^Username/ }));
    expect(bodyRows()[0]).toHaveTextContent("adam");
    expect(bodyRows()[2]).toHaveTextContent("zoe");
    await user.click(screen.getByRole("button", { name: /^Username/ }));
    expect(bodyRows()[0]).toHaveTextContent("zoe");
  });

  it("sorts the user ID numerically, not as text", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: /^User ID/ }));
    const columnHeader = screen.getByRole("columnheader", { name: /User ID/ });
    const ids = bodyRows().map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    // Numeric order is 1, 2, 10; text order would put "10" before "2".
    expect(ids).toEqual(
      columnHeader.getAttribute("aria-sort") === "ascending" ? ["1", "2", "10"] : ["10", "2", "1"],
    );
  });

  it("filters by username, display name, ID or timestamp", async () => {
    const user = userEvent.setup();
    renderTable();
    const search = screen.getByRole("searchbox", { name: "Search users" });

    await user.type(search, "member");
    expect(bodyRows()).toHaveLength(2);

    await user.clear(search);
    await user.type(search, "10");
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("mia");

    await user.clear(search);
    await user.type(search, "2026-02-01");
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("adam");

    await user.clear(search);
    await user.type(search, "nobody");
    expect(screen.getByText("No users match your search.")).toBeInTheDocument();
  });

  it("requests deletion, but never for the current account", async () => {
    const user = userEvent.setup();
    const { onRequestDelete } = renderTable();
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons[0]).toBeDisabled();
    await user.click(deleteButtons[1]!);
    expect(onRequestDelete).toHaveBeenCalledWith(2);
  });
});
