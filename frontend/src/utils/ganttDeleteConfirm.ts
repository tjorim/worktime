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
      ? m.gantt_delete_task_unlink_count_one({ count: linkedEntryCount })
      : m.gantt_delete_task_unlink_count_other({ count: linkedEntryCount });

  return `${baseMessage} ${unlinkMessage}`;
}
