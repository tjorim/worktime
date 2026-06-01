import { useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import ProgressBar from "react-bootstrap/ProgressBar";
import Table from "react-bootstrap/Table";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import type { GanttTask } from "@/types/gantt";
import * as m from "@/paraglide/messages.js";

type SortColumn = "name" | "start";
type SortDirection = "asc" | "desc";

interface GanttTableViewProps {
  tasks: GanttTask[];
  onTaskClick: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  const icon = active ? (direction === "asc" ? "bi-sort-up" : "bi-sort-down") : "bi-arrow-down-up";
  return <i className={`bi ${icon} ms-1`} aria-hidden="true"></i>;
}

export function GanttTableView({ tasks, onTaskClick, onDeleteTask }: GanttTableViewProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("start");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [deletingTask, setDeletingTask] = useState<GanttTask | null>(null);
  const taskNames = useMemo(() => new Map(tasks.map((task) => [task.id, task.name])), [tasks]);

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const comparison = left[sortColumn].localeCompare(right[sortColumn]);
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [sortColumn, sortDirection, tasks],
  );

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  };

  const handleDelete = () => {
    if (!deletingTask) return;
    onDeleteTask(deletingTask.id);
    setDeletingTask(null);
  };

  const getDependencies = (dependencies?: string) => {
    if (typeof dependencies !== "string") return "—";

    return (
      dependencies
        .split(",")
        .map((dependency) => dependency.trim())
        .filter(Boolean)
        .map((dependency) => taskNames.get(dependency) ?? dependency)
        .join(", ") || "—"
    );
  };

  return (
    <>
      <Table striped hover responsive aria-label={m.gantt_table_aria()}>
        <thead>
          <tr>
            <th scope="col">
              <Button
                variant="link"
                className="p-0 fw-semibold text-decoration-none"
                aria-label={m.gantt_table_sort_aria({ column: m.gantt_table_name() })}
                onClick={() => handleSort("name")}
              >
                {m.gantt_table_name()}
                <SortIcon active={sortColumn === "name"} direction={sortDirection} />
              </Button>
            </th>
            <th scope="col">
              <Button
                variant="link"
                className="p-0 fw-semibold text-decoration-none"
                aria-label={m.gantt_table_sort_aria({ column: m.gantt_table_start() })}
                onClick={() => handleSort("start")}
              >
                {m.gantt_table_start()}
                <SortIcon active={sortColumn === "start"} direction={sortDirection} />
              </Button>
            </th>
            <th scope="col">{m.gantt_table_end()}</th>
            <th scope="col">{m.gantt_table_progress()}</th>
            <th scope="col">{m.gantt_table_dependencies()}</th>
            <th scope="col">{m.gantt_table_notes()}</th>
            <th scope="col" className="text-end">
              {m.gantt_table_actions()}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">
                {m.gantt_table_empty()}
              </td>
            </tr>
          ) : (
            sortedTasks.map((task) => (
              <tr key={task.id} onClick={() => onTaskClick(task.id)}>
                <td className="fw-semibold">{task.name}</td>
                <td>{task.start}</td>
                <td>{task.end}</td>
                <td style={{ minWidth: "8rem" }}>
                  <ProgressBar now={task.progress} label={`${task.progress}%`} />
                </td>
                <td>{getDependencies(task.dependencies)}</td>
                <td title={task.notes}>{task.notes || "—"}</td>
                <td className="text-end text-nowrap">
                  <Button
                    variant="link"
                    size="sm"
                    className="text-body"
                    aria-label={m.gantt_table_edit_aria({ name: task.name })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTaskClick(task.id);
                    }}
                  >
                    <i className="bi bi-pencil" aria-hidden="true"></i>
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger"
                    aria-label={m.gantt_table_delete_aria({ name: task.name })}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeletingTask(task);
                    }}
                  >
                    <i className="bi bi-trash" aria-hidden="true"></i>
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <ConfirmationDialog
        isOpen={deletingTask !== null}
        title={m.gantt_delete_task_title()}
        message={deletingTask ? m.gantt_delete_task_message({ name: deletingTask.name }) : ""}
        confirmLabel={m.gantt_delete_label()}
        variant="danger"
        icon="bi-trash"
        onConfirm={handleDelete}
        onCancel={() => setDeletingTask(null)}
      />
    </>
  );
}
