/** Shape of `window.__worktimeTest`, exposed by `src/main.tsx` when `VITE_MSW=true` (e2e mode). */
export interface WorktimeTestHooks {
  tasksCollection: {
    insert(task: Record<string, unknown>): void;
    toArray: Array<{ id: string; startTime: string; stopTime?: string }>;
  };
}
