import { describe, expect, it } from "vitest";
import { ganttDependencyError } from "@/utils/ganttDependencies";

describe("Gantt dependencies", () => {
  const tasks = [{ id: "a", dependencies: "b" }, { id: "b", dependencies: "c" }, { id: "c" }];
  it("rejects missing targets, self references and transitive cycles", () => {
    expect(ganttDependencyError(tasks, "c", "missing")).toBe("gantt_dependency_unknown");
    expect(ganttDependencyError(tasks, "c", " c ")).toBe("gantt_dependency_self");
    expect(ganttDependencyError(tasks, "c", "a")).toBe("gantt_dependency_cycle");
    expect(ganttDependencyError(tasks, "a", " b, b, c ")).toBeUndefined();
  });
  it("terminates on unrelated legacy cycles and dangling references", () => {
    expect(
      ganttDependencyError([{ id: "a", dependencies: "a, missing" }], "b", "a"),
    ).toBeUndefined();
  });
});
