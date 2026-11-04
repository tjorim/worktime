import type { GanttTask } from "@/types/gantt";

export function dependencyIds(value?: unknown): string[] {
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function ganttDependencyError(
  tasks: Array<Pick<GanttTask, "id" | "dependencies">>,
  id: string,
  dependencies?: string,
): string | undefined {
  const graph = new Map(tasks.map((task) => [task.id, dependencyIds(task.dependencies)]));
  const targets = dependencyIds(dependencies);
  if (targets.includes(id)) return "gantt_dependency_self";
  if (targets.some((target) => !graph.has(target))) return "gantt_dependency_unknown";
  const pending = [...targets];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === id) return "gantt_dependency_cycle";
    if (!visited.has(current)) {
      visited.add(current);
      pending.push(...(graph.get(current) ?? []));
    }
  }
}
