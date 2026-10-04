import { Pencil as PencilIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableSearchInput } from "@/components/shared/TableSearchInput";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import type { SortingState } from "@tanstack/react-table";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { SortableHeaderCell } from "@/components/shared/SortableHeaderCell";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  createDataColumnHelper,
  DATA_TABLE_DEFAULT_PAGE_SIZE,
  useDataTable,
} from "@/hooks/useDataTable";
import { dayjs } from "@/utils/dateTimeUtils";
import { getGanttDeleteConfirmMessage } from "@/utils/ganttDeleteConfirm";
import { formatLoggedDuration, getLoggedMinutesByTaskId } from "@/utils/ganttLoggedTime";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import {
  buildLabelColorMap,
  buildLabelNameMap,
  getContrastingTextColor,
  getDefaultLabelColor,
} from "@/lib/timeTracking/constants";
import type { GanttTask } from "@/types/gantt";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

interface GanttTableViewProps {
  tasks: GanttTask[];
  onTaskClick: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

type TaskLink = { id: string; name: string; known: boolean };

type GanttRow = {
  task: GanttTask;
  labelName: string;
  loggedMinutes: number;
  /** Tasks this one depends on (its predecessors), in the order they were entered. */
  dependsOn: TaskLink[];
  /** Tasks that depend on this one (its successors). Derived, never stored. */
  requiredBy: TaskLink[];
  searchText: string;
};

const columnHelper = createDataColumnHelper<GanttRow>();

const DEFAULT_SORTING: SortingState = [{ id: "start", desc: false }];

const HIGHLIGHT_MS = 2000;

function parseDependencyIds(dependencies: unknown): string[] {
  // Imported data isn't always well-formed, so guard the non-string case.
  if (typeof dependencies !== "string") return [];
  return dependencies
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

const linkNames = (links: TaskLink[]) => links.map((link) => link.name).join(", ");

const rowDomId = (taskId: string) => `gantt-task-row-${taskId}`;

export function GanttTableView({ tasks, onTaskClick, onDeleteTask }: GanttTableViewProps) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [search, setSearch] = useState("");
  const [deletingTask, setDeletingTask] = useState<GanttTask | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Bumped per jump so the effect below re-runs even for the same target.
  const [jumpRequest, setJumpRequest] = useState(0);
  const jumpTargetRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const { tasks: timeTrackingTasks, labels } = useTimeTrackingStorage();
  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  const labelColorById = useMemo(() => buildLabelColorMap(labels), [labels]);
  const taskNames = useMemo(() => new Map(tasks.map((task) => [task.id, task.name])), [tasks]);
  const loggedMinutesByTaskId = useMemo(
    () => getLoggedMinutesByTaskId(timeTrackingTasks),
    [timeTrackingTasks],
  );
  const linkedEntryCount = useMemo(
    () =>
      deletingTask
        ? timeTrackingTasks.filter((entry) => entry.ganttTaskId === deletingTask.id).length
        : 0,
    [deletingTask, timeTrackingTasks],
  );

  const locale = getLocale();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const formatDate = useCallback(
    (isoDate: string) => dateFormatter.format(dayjs(isoDate).toDate()),
    [dateFormatter],
  );

  const rows = useMemo<GanttRow[]>(() => {
    const dependentsById = new Map<string, TaskLink[]>();
    const dependsOnById = new Map<string, TaskLink[]>();
    for (const task of tasks) {
      const links = parseDependencyIds(task.dependencies).map((id) => ({
        id,
        name: taskNames.get(id) ?? id,
        known: taskNames.has(id),
      }));
      dependsOnById.set(task.id, links);
      for (const link of links) {
        if (!link.known) continue;
        const dependents = dependentsById.get(link.id) ?? [];
        dependents.push({ id: task.id, name: task.name, known: true });
        dependentsById.set(link.id, dependents);
      }
    }

    return tasks.map((task) => {
      const labelName = task.label ? (labelNameById[task.label] ?? m.tt_unknown_label()) : "";
      const dependsOn = dependsOnById.get(task.id) ?? [];
      const requiredBy = dependentsById.get(task.id) ?? [];
      const loggedMinutes = loggedMinutesByTaskId.get(task.id) ?? 0;
      return {
        task,
        labelName,
        loggedMinutes,
        dependsOn,
        requiredBy,
        // Every visible column is searchable, dates as displayed and as ISO.
        // Newline-joined so a query can't match across two fields.
        searchText: [
          task.name,
          formatDate(task.start),
          task.start,
          formatDate(task.end),
          task.end,
          labelName,
          `${task.progress}%`,
          loggedMinutes > 0 ? formatLoggedDuration(loggedMinutes) : "",
          linkNames(dependsOn),
          linkNames(requiredBy),
          task.notes ?? "",
        ]
          .join("\n")
          .toLowerCase(),
      };
    });
  }, [tasks, labelNameById, taskNames, loggedMinutesByTaskId, formatDate]);

  // Columns only drive headers, sorting and search. Body cells are rendered
  // directly below: TanStack renders `cell` functions as components, so a
  // column list that changed identity would remount the row buttons.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.task.name, {
          id: "name",
          header: () => m.gantt_table_name(),
          sortFn: "text",
        }),
        // ISO dates sort correctly as text.
        columnHelper.accessor((row) => row.task.start, {
          id: "start",
          header: () => m.gantt_table_start(),
          sortFn: "text",
        }),
        columnHelper.accessor((row) => row.task.end, {
          id: "end",
          header: () => m.gantt_table_end(),
          sortFn: "text",
        }),
        columnHelper.accessor("labelName", {
          id: "label",
          header: () => m.form_label(),
          sortFn: "text",
        }),
        columnHelper.accessor((row) => row.task.progress, {
          id: "progress",
          header: () => m.gantt_table_progress(),
          sortFn: "basic",
        }),
        columnHelper.accessor("loggedMinutes", {
          id: "logged",
          header: () => m.gantt_table_logged(),
          sortFn: "basic",
        }),
        columnHelper.accessor((row) => linkNames(row.dependsOn), {
          id: "dependencies",
          header: () => m.gantt_table_dependencies(),
          enableSorting: false,
        }),
        columnHelper.accessor((row) => linkNames(row.requiredBy), {
          id: "requiredBy",
          header: () => m.gantt_table_required_by(),
          enableSorting: false,
        }),
        columnHelper.accessor((row) => row.task.notes ?? "", {
          id: "notes",
          header: () => m.gantt_table_notes(),
          enableSorting: false,
        }),
        columnHelper.display({
          id: "actions",
          header: () => m.gantt_table_actions(),
        }),
      ]),
    [],
  );

  const table = useDataTable(
    {
      data: rows,
      columns,
      state: { sorting, globalFilter: search },
      initialState: { pagination: { pageIndex: 0, pageSize: DATA_TABLE_DEFAULT_PAGE_SIZE } },
      getRowId: (row) => row.task.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setSearch,
      globalFilterFn: (row, _columnId, filterValue) => {
        const needle = String(filterValue).trim().toLowerCase();
        return !needle || row.original.searchText.includes(needle);
      },
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
    }),
  );

  const prePaginatedRows = table.getPrePaginatedRowModel().rows;
  const { pageIndex, pageSize } = table.state.pagination;
  const isFiltering = search.trim() !== "";

  // Finishes a jump once the target row is in the filtered/sorted list: moves
  // to the page holding it, then scrolls it into view. Re-runs as the search
  // clears and the page changes, and stops once the row is on screen.
  useEffect(() => {
    const targetId = jumpTargetRef.current;
    if (targetId === null) return;
    const index = prePaginatedRows.findIndex((row) => row.id === targetId);
    if (index === -1) return;
    const targetPage = Math.floor(index / pageSize);
    if (targetPage !== pageIndex) {
      table.setPageIndex(targetPage);
      return;
    }
    jumpTargetRef.current = null;
    document.getElementById(rowDomId(targetId))?.scrollIntoView({ block: "center" });
  }, [jumpRequest, prePaginatedRows, pageIndex, pageSize, table]);

  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

  const handleJumpToTask = (taskId: string) => {
    jumpTargetRef.current = taskId;
    // A search that hides the target would make the jump land nowhere.
    if (isFiltering && !prePaginatedRows.some((row) => row.id === taskId)) {
      setSearch("");
    }
    setHighlightedId(taskId);
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    setJumpRequest((request) => request + 1);
  };

  const renderTaskLinks = (links: TaskLink[]) =>
    links.length === 0
      ? "—"
      : links.map((link) =>
          link.known ? (
            <Button
              key={link.id}
              variant="outline"
              size="sm"
              className="mr-1 mb-1"
              aria-label={m.gantt_table_go_to_task({ name: link.name })}
              onClick={() => handleJumpToTask(link.id)}
            >
              {link.name}
            </Button>
          ) : (
            <span key={link.id} className="mr-1 text-muted-foreground">
              {link.name}
            </span>
          ),
        );

  const handleDelete = () => {
    if (!deletingTask) return;
    onDeleteTask(deletingTask.id);
    setDeletingTask(null);
  };

  const visibleRows = table.getRowModel().rows;

  return (
    <>
      {tasks.length > 0 && (
        <TableSearchInput
          type="search"
          className="mb-3"
          placeholder={m.gantt_table_search_placeholder()}
          aria-label={m.gantt_table_search_aria()}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      <Table aria-label={m.gantt_table_aria()}>
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
                className="py-4 text-center text-muted-foreground"
              >
                {isFiltering ? m.gantt_table_no_results() : m.gantt_table_empty()}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((tableRow) => {
              const { task, labelName, loggedMinutes, dependsOn, requiredBy } = tableRow.original;
              const labelBackground = task.label
                ? (labelColorById[task.label] ?? getDefaultLabelColor())
                : null;
              return (
                <TableRow
                  key={task.id}
                  id={rowDomId(task.id)}
                  className={
                    highlightedId === task.id
                      ? "bg-wt-warning-bg hover:bg-wt-warning-bg"
                      : "odd:bg-muted/30"
                  }
                >
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-left font-semibold text-foreground"
                      onClick={() => onTaskClick(task.id)}
                    >
                      {task.name}
                    </Button>
                  </TableCell>
                  <TableCell>{formatDate(task.start)}</TableCell>
                  <TableCell>{formatDate(task.end)}</TableCell>
                  <TableCell>
                    {labelBackground ? (
                      <span
                        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-semibold bg-label text-label-foreground"
                        style={
                          {
                            "--label-bg": labelBackground,
                            "--label-fg": getContrastingTextColor(labelBackground),
                          } as CSSProperties
                        }
                      >
                        {labelName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="min-w-32">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={task.progress}
                        aria-label={m.gantt_table_progress()}
                        className="flex-1"
                        trackClassName="h-2 border border-border"
                      />
                      <span className="text-sm whitespace-nowrap text-muted-foreground">
                        {task.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {loggedMinutes > 0 ? formatLoggedDuration(loggedMinutes) : "—"}
                  </TableCell>
                  <TableCell>{renderTaskLinks(dependsOn)}</TableCell>
                  <TableCell>{renderTaskLinks(requiredBy)}</TableCell>
                  <TableCell title={task.notes}>{task.notes || "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="link"
                      size="sm"
                      className="text-foreground"
                      aria-label={m.gantt_table_edit_aria({ name: task.name })}
                      onClick={() => onTaskClick(task.id)}
                    >
                      <Icon icon={PencilIcon} />
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-destructive"
                      aria-label={m.gantt_table_delete_aria({ name: task.name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeletingTask(task);
                      }}
                    >
                      <Icon icon={Trash2Icon} />
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

      <ConfirmationDialog
        isOpen={deletingTask !== null}
        title={m.gantt_delete_task_title()}
        message={
          deletingTask ? getGanttDeleteConfirmMessage(deletingTask.name, linkedEntryCount) : ""
        }
        confirmLabel={m.gantt_delete_label()}
        variant="danger"
        icon={Trash2Icon}
        onConfirm={handleDelete}
        onCancel={() => setDeletingTask(null)}
      />
    </>
  );
}
