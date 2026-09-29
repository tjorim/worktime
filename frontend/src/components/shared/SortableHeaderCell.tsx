import { flexRender, type Header, type RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "@/hooks/useDataTable";

interface SortableHeaderCellProps<TData extends RowData> {
  header: Header<DataTableFeatures, TData>;
  className?: string;
}

/**
 * `<th>` for a `useDataTable` column: a click-to-sort button with a direction
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
    <th
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
        <button
          type="button"
          className="btn btn-link p-0 text-decoration-none text-reset fw-semibold"
          onClick={column.getToggleSortingHandler()}
        >
          {content}
          {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
        </button>
      ) : (
        content
      )}
    </th>
  );
}
