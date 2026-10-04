import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableSearchInput } from "@/components/shared/TableSearchInput";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import type { SortingState } from "@tanstack/react-table";
import { SortableHeaderCell } from "@/components/shared/SortableHeaderCell";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  createDataColumnHelper,
  DATA_TABLE_DEFAULT_PAGE_SIZE,
  useDataTable,
} from "@/hooks/useDataTable";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

export interface AdminUserRow {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface AdminUsersTableProps {
  users: AdminUserRow[];
  currentAccountId: number | null;
  deletingAdminUserId: number | null;
  onRequestDelete: (userId: number) => void;
}

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const locale = getLocale() === "nl" ? "nl-NL" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const columnHelper = createDataColumnHelper<AdminUserRow>();

// Keep the order the server returned until the admin picks a column.
const DEFAULT_SORTING: SortingState = [];

/**
 * Searchable, sortable, paginated table of local users for the admin settings
 * section. Body cells are rendered directly (not via column `cell` renderers)
 * so the row buttons never remount when the column list is rebuilt.
 */
export function AdminUsersTable({
  users,
  currentAccountId,
  deletingAdminUserId,
  onRequestDelete,
}: AdminUsersTableProps) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [search, setSearch] = useState("");

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("id", {
          header: () => m.account_admin_users_user_id(),
          sortFn: "basic",
        }),
        columnHelper.accessor("username", {
          header: () => m.account_admin_users_username(),
          sortFn: "text",
        }),
        columnHelper.accessor("display_name", {
          header: () => m.account_admin_users_display_name(),
          sortFn: "text",
        }),
        // ISO timestamps sort correctly as text.
        columnHelper.accessor("created_at", {
          header: () => m.account_admin_users_created_at(),
          sortFn: "text",
        }),
        columnHelper.accessor("updated_at", {
          header: () => m.account_admin_users_updated_at(),
          sortFn: "text",
        }),
        columnHelper.display({
          id: "actions",
          header: () => m.account_admin_users_actions(),
        }),
      ]),
    [],
  );

  const table = useDataTable(
    {
      data: users,
      columns,
      state: { sorting, globalFilter: search },
      initialState: { pagination: { pageIndex: 0, pageSize: DATA_TABLE_DEFAULT_PAGE_SIZE } },
      getRowId: (row) => String(row.id),
      onSortingChange: setSorting,
      onGlobalFilterChange: setSearch,
      globalFilterFn: (row, _columnId, filterValue) => {
        const needle = String(filterValue).trim().toLowerCase();
        if (!needle) return true;
        const { id, username, display_name, created_at, updated_at } = row.original;
        // Every visible column, timestamps as displayed and as ISO.
        return [
          String(id),
          username,
          display_name,
          formatTimestamp(created_at),
          created_at,
          formatTimestamp(updated_at),
          updated_at,
        ].some((field) => field.toLowerCase().includes(needle));
      },
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
    }),
  );

  const visibleRows = table.getRowModel().rows;

  return (
    <>
      <TableSearchInput
        type="search"
        className="mb-2"
        placeholder={m.account_admin_users_search_placeholder()}
        aria-label={m.account_admin_users_search_aria()}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <SortableHeaderCell
                  key={header.id}
                  header={header}
                  className={header.column.id === "actions" ? "text-right" : undefined}
                />
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-3 text-center text-muted-foreground"
              >
                {m.account_admin_users_no_results()}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((tableRow) => {
              const user = tableRow.original;
              return (
                <TableRow key={user.id} className="odd:bg-muted/30">
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.display_name}</TableCell>
                  <TableCell>{formatTimestamp(user.created_at)}</TableCell>
                  <TableCell>{formatTimestamp(user.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={currentAccountId === user.id || deletingAdminUserId !== null}
                      title={
                        currentAccountId === user.id
                          ? m.account_admin_users_delete_self_blocked()
                          : undefined
                      }
                      onClick={() => onRequestDelete(user.id)}
                    >
                      {deletingAdminUserId === user.id
                        ? m.account_admin_users_delete_busy()
                        : m.delete()}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <TablePagination
        total={table.getPrePaginatedRowModel().rows.length}
        pageIndex={table.state.pagination.pageIndex}
        pageSize={table.state.pagination.pageSize}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onPreviousPage={() => table.previousPage()}
        onNextPage={() => table.nextPage()}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />
    </>
  );
}
