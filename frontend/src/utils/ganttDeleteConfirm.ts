import * as m from "@/paraglide/messages.js";

export function getGanttDeleteConfirmMessage(
  taskName: string | undefined,
  linkedEntryCount: number,
): string {
  const baseMessage = taskName
    ? m.gantt_delete_task_message({ name: taskName })
    : m.gantt_delete_task_unnamed_message();

  if (linkedEntryCount <= 0) {
    return baseMessage;
  }

  const unlinkMessage =
    linkedEntryCount === 1
      ? m.gantt_delete_task_unlink_count({ count: linkedEntryCount })
      : m.gantt_delete_task_unlink_count_plural({ count: linkedEntryCount });

  return `${baseMessage} ${unlinkMessage}`;
}
