import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import * as m from "@/paraglide/messages.js";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface TablePaginationProps {
  /** Total row count after filtering/sorting, before pagination slices it. */
  total: number;
  /** 0-based current page index, as TanStack Table tracks it. */
  pageIndex: number;
  pageSize: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

/**
 * Client-side pagination controls for tables whose full dataset is already in
 * the browser. Mirrors champagnefestival's AdminTablePagination.
 */
export function TablePagination({
  total,
  pageIndex,
  pageSize,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: TablePaginationProps) {
  if (total === 0) return null;

  const rangeFrom = pageIndex * pageSize + 1;
  const rangeTo = Math.min((pageIndex + 1) * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2 border-top">
      <span className="text-muted small">
        {m.table_page_summary({ from: rangeFrom, to: rangeTo, total })}
      </span>
      <div className="d-flex align-items-center gap-2">
        <Form.Select
          size="sm"
          className="w-auto"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label={m.table_page_size_aria()}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Form.Select>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={!canPreviousPage}
          onClick={onPreviousPage}
        >
          {m.table_page_previous()}
        </Button>
        <span className="text-muted small">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button variant="outline-secondary" size="sm" disabled={!canNextPage} onClick={onNextPage}>
          {m.table_page_next()}
        </Button>
      </div>
    </div>
  );
}
