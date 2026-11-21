import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
      <span className="text-sm text-muted-foreground">
        {m.table_page_summary({ from: rangeFrom, to: rangeTo, total })}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={pageSize}
          onValueChange={(value) => {
            if (value !== null) onPageSizeChange(value);
          }}
        >
          <SelectTrigger size="sm" aria-label={m.table_page_size_aria()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={!canPreviousPage} onClick={onPreviousPage}>
          {m.table_page_previous()}
        </Button>
        <span className="text-sm text-muted-foreground">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={!canNextPage} onClick={onNextPage}>
          {m.table_page_next()}
        </Button>
      </div>
    </div>
  );
}
