import { TableHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { flexRender, type Header, type RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "@/hooks/useDataTable";

interface SortableHeaderCellProps<TData extends RowData> {
  header: Header<DataTableFeatures, TData>;
  className?: string;
}

/**
 * `<TableHead>` for a `useDataTable` column: a click-to-sort button with a direction
 * arrow and `aria-sort` when the column is sortable, plain text otherwise.
 */
export function SortableHeaderCell<TData extends RowData>({
  header,
  className,
}: SortableHeaderCellProps<TData>) {
  const { column } = header;
  const sorted = column.getIsSorted();
  const canSort = column.getCanSort();
  const content = header.isPlaceholder
    ? null
    : flexRender(column.columnDef.header, header.getContext());

  return (
    <TableHead
      scope="col"
      className={className}
      aria-sort={
        canSort
          ? sorted === "asc"
            ? "ascending"
            : sorted === "desc"
              ? "descending"
              : "none"
          : undefined
      }
    >
      {canSort ? (
        <Button
          type="button"
          variant="ghost"
          className="tw:h-auto tw:p-0 tw:font-semibold"
          onClick={column.getToggleSortingHandler()}
        >
          {content}
          {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
        </Button>
      ) : (
        content
      )}
    </TableHead>
  );
}
