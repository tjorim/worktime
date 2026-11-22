import type { SyncPushPayload, SyncPushResponse } from "@/api-types";
import { ApiError, SettingsReplacementError } from "@/lib/api/apiError";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { applyPullToCollections, runWriteBatch } from "@/lib/db/collectionPull";
import {
  collectionFetch,
  fetchSyncSnapshot,
  getSyncCollectionUserId,
  isSyncCollectionAuthResolving,
  requestSyncCollectionPull,
} from "@/lib/db/collectionTransport";
import { ganttTasksCollection } from "@/lib/db/ganttTasksCollection";
import { labelsCollection } from "@/lib/db/labelsCollection";
import { tasksCollection } from "@/lib/db/tasksCollection";
import { templatesCollection } from "@/lib/db/templatesCollection";
import { logger } from "@/lib/logger";
import { MAX_SYNC_PUSH_ITEMS, countPushConflicts } from "@/lib/sync/syncRequests";
import type { Label } from "@/lib/time-tracking/constants";
import type { TimeTrackingTemplate } from "@/lib/time-tracking/types";

/** Online settings edits never queue destructive retries; pushes can partially commit. */
export async function replaceTimeTrackingSettings(
  kind: "labels" | "templates",
  items: Label[] | TimeTrackingTemplate[],
  confirmedRemoval = false,
): Promise<void> {
  const owner = getSyncCollectionUserId();
  if (isSyncCollectionAuthResolving()) throw new Error("Authentication is still resolving");
  const collection = kind === "labels" ? labelsCollection : templatesCollection;
  const previous = collection.toArray;
  const ids = new Set(items.map((item) => item.id));
  const removedItems = previous.filter((item) => !ids.has(item.id));
  if (getSyncCollectionUserId() && kind === "labels") {
    // Creates/renames precede removals on the server, so even a name being
    // removed by this replacement still conflicts until a separate save.
    const names = new Set<string>();
    for (const item of items as Label[]) {
      if (
        names.has(item.name) ||
        previous.some((old) => "name" in old && old.id !== item.id && old.name === item.name)
      ) {
        throw new Error("Duplicate label name");
      }
      names.add(item.name);
    }
    const references = [
      ...tasksCollection.toArray,
      ...templatesCollection.toArray,
      ...ganttTasksCollection.toArray,
    ];
    if (removedItems.some((item) => references.some((reference) => reference.label === item.id))) {
      throw new Error("Label is in use");
    }
  } else if (
    getSyncCollectionUserId() &&
    kind === "templates" &&
    (items as TimeTrackingTemplate[]).some((item) => !labelsCollection.has(item.label))
  ) {
    throw new Error("Unknown template label");
  }
  if (getSyncCollectionUserId()) {
    const now = dayjs().toISOString();
    const changedItems = items.filter((item) => {
      const old = previous.find((row) => row.id === item.id);
      if (!old) return true;
      return "name" in item && "name" in old
        ? item.name !== old.name || item.color !== old.color
        : "text" in item &&
            "text" in old &&
            (item.text !== old.text ||
              item.label !== old.label ||
              item.start !== old.start ||
              item.stop !== old.stop);
    });
    const changes = changedItems.map((item) => ({
      id: item.id,
      action: collection.has(item.id) ? ("update" as const) : ("create" as const),
      client_updated_at: now,
      ...("name" in item
        ? { name: item.name, color: item.color }
        : {
            text: item.text,
            label_id: item.label,
            start_time: `${item.start}:00`,
            stop_time: `${item.stop}:00`,
          }),
    }));
    const removed = removedItems.map((item) => ({
      id: item.id,
      action: "delete" as const,
      client_updated_at: now,
    }));
    const diff = [...changes, ...removed];
    let sent = false;
    let applied = 0;
    let conflicts = 0;
    try {
      for (let offset = 0; offset < diff.length; offset += MAX_SYNC_PUSH_ITEMS) {
        if (getSyncCollectionUserId() !== owner) throw new Error("Settings owner changed");
        const payload: SyncPushPayload = {
          labels: [],
          templates: [],
          tasks: [],
          gantt_tasks: [],
          work_locations: [],
          time_off_entries: [],
          [kind]: diff.slice(offset, offset + MAX_SYNC_PUSH_ITEMS),
          declared_delete_total: removed.length,
          ...(confirmedRemoval && removed.length > 0 ? { allow_bulk_delete: true } : {}),
        };
        const response = await collectionFetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw await ApiError.fromResponse(response);
        sent = true;
        const result = (await response.json()) as SyncPushResponse;
        applied += Object.values(result.results)
          .flat()
          .filter((record) => record.status === "ok").length;
        conflicts += countPushConflicts(result);
        if (conflicts > 0) throw new Error("Settings replacement conflicted");
      }
    } catch (error) {
      if (sent && getSyncCollectionUserId() === owner) {
        try {
          const snapshot = await fetchSyncSnapshot();
          if (getSyncCollectionUserId() === owner) applyPullToCollections(snapshot);
        } catch (refreshError) {
          logger.warn("Could not refresh partially applied settings", refreshError);
        }
        requestSyncCollectionPull();
        throw new SettingsReplacementError(applied, conflicts);
      }
      throw error;
    }
  }
  if (getSyncCollectionUserId() !== owner) throw new Error("Settings owner changed");
  // Direct writes only after acceptance; a rejected push leaves local rows intact.
  if (kind === "labels") {
    runWriteBatch(labelsCollection, true, () => {
      const ids = new Set(items.map((item) => item.id));
      const removed = previous.filter((item) => !ids.has(item.id));
      if (removed.length) labelsCollection.utils.writeDelete(removed.map((item) => item.id));
      if (items.length) labelsCollection.utils.writeUpsert(items as Label[]);
    });
  } else {
    runWriteBatch(templatesCollection, true, () => {
      const ids = new Set(items.map((item) => item.id));
      const removed = previous.filter((item) => !ids.has(item.id));
      if (removed.length) templatesCollection.utils.writeDelete(removed.map((item) => item.id));
      if (items.length) templatesCollection.utils.writeUpsert(items as TimeTrackingTemplate[]);
    });
  }
  requestSyncCollectionPull();
}

/**
 * Move every task, template and Gantt task off `labelId` onto `replacementId`,
 * then delete `labelId`.
 *
 * The server refuses to delete a label that is still referenced and applies a
 * push's label deletions before its task updates, so this is two steps: the
 * reassignment (label-only partial updates, split into chunks like any push),
 * then the ordinary label removal. A failure part-way leaves the moved records
 * on the replacement label and the old label in place, so retrying is safe.
 * Online, a record the server has since changed is reported as a conflict and
 * stops the operation before anything is deleted.
 */
export async function reassignAndDeleteLabel(
  labelId: string,
  replacementId: string,
): Promise<void> {
  const owner = getSyncCollectionUserId();
  if (isSyncCollectionAuthResolving()) throw new Error("Authentication is still resolving");
  if (labelId === replacementId || !labelsCollection.has(labelId)) {
    throw new Error("Unknown label");
  }
  if (!labelsCollection.has(replacementId)) throw new Error("Unknown replacement label");

  const tasks = tasksCollection.toArray.filter((task) => task.label === labelId);
  const templates = templatesCollection.toArray.filter((template) => template.label === labelId);
  const ganttTasks = ganttTasksCollection.toArray.filter((task) => task.label === labelId);

  if (owner) {
    const now = dayjs().toISOString();
    const toItem = (id: string) => ({
      id,
      action: "update" as const,
      client_updated_at: now,
      label_id: replacementId,
    });
    const taskItems = tasks.map((task) => toItem(task.id));
    const templateItems = templates.map((template) => toItem(template.id));
    const ganttItems = ganttTasks.map((task) => toItem(task.id));
    const total = taskItems.length + templateItems.length + ganttItems.length;
    const chunks = Math.ceil(
      Math.max(taskItems.length, templateItems.length, ganttItems.length) / MAX_SYNC_PUSH_ITEMS,
    );
    let sent = false;
    let applied = 0;
    let conflicts = 0;
    try {
      for (let chunk = 0; chunk < chunks; chunk++) {
        if (getSyncCollectionUserId() !== owner) throw new Error("Settings owner changed");
        const from = chunk * MAX_SYNC_PUSH_ITEMS;
        const to = from + MAX_SYNC_PUSH_ITEMS;
        const payload: SyncPushPayload = {
          labels: [],
          tasks: taskItems.slice(from, to),
          templates: templateItems.slice(from, to),
          work_locations: [],
          time_off_entries: [],
          gantt_tasks: ganttItems.slice(from, to),
        };
        const response = await collectionFetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw await ApiError.fromResponse(response);
        sent = true;
        const result = (await response.json()) as SyncPushResponse;
        applied += Object.values(result.results)
          .flat()
          .filter((record) => record.status === "ok").length;
        conflicts += countPushConflicts(result);
        if (conflicts > 0) throw new SettingsReplacementError(applied, conflicts);
      }
    } catch (error) {
      if (sent && getSyncCollectionUserId() === owner) {
        try {
          applyPullToCollections(await fetchSyncSnapshot());
        } catch (refreshError) {
          logger.warn("Could not refresh partially reassigned label", refreshError);
        }
        requestSyncCollectionPull();
        if (error instanceof SettingsReplacementError) throw error;
        throw new SettingsReplacementError(applied, total - applied);
      }
      throw error;
    }
  }
  if (getSyncCollectionUserId() !== owner) throw new Error("Settings owner changed");

  // Accepted by the server (or local-only): fold the move into the local rows
  // so the label's usage check below sees them on the replacement label.
  runWriteBatch(tasksCollection, tasks.length > 0, () =>
    tasksCollection.utils.writeUpsert(tasks.map((task) => ({ ...task, label: replacementId }))),
  );
  runWriteBatch(templatesCollection, templates.length > 0, () =>
    templatesCollection.utils.writeUpsert(
      templates.map((template) => ({ ...template, label: replacementId })),
    ),
  );
  runWriteBatch(ganttTasksCollection, ganttTasks.length > 0, () =>
    ganttTasksCollection.utils.writeUpsert(
      ganttTasks.map((task) => ({ ...task, label: replacementId })),
    ),
  );

  await replaceTimeTrackingSettings(
    "labels",
    labelsCollection.toArray.filter((label) => label.id !== labelId),
  );
}
