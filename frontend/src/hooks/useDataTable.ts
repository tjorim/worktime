import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Shared TanStack Table setup for list-style tables that hold their whole
 * dataset in the browser: search (global filter), click-to-sort headers and
 * client-side pagination. Mirrors champagnefestival's `useAdminTable`.
 *
 * Pair it with `SortableHeaderCell` and `TablePagination` from
 * `components/shared/`. Tables that need something else (e.g. column
 * visibility toggles) should call `useTable` with their own features.
 */
export const {
  useAppTable: useDataTable,
  createAppColumnHelper: createDataColumnHelper,
  appFeatures: dataTableFeatures,
} = createTableHook({
  features: tableFeatures({
    columnFilteringFeature,
    globalFilteringFeature,
    rowSortingFeature,
    rowPaginationFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    filterFns,
    sortFns,
  }),
});

export type DataTableFeatures = typeof dataTableFeatures;

export const DATA_TABLE_DEFAULT_PAGE_SIZE = 20;
