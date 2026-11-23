import { formatDisplayDate } from "@/lib/dates/dateTimeUtils";
import { getEntryTypeFlag } from "@/lib/time-off/codecs";
import { getEventTypeLabel } from "@/lib/hday/presentation";
import { isValidEntryType } from "@/lib/time-off/types";
import type { AuditEntry } from "@/features/settings/hooks/useSettingsAuditTrail";
import * as m from "@/paraglide/messages.js";

export function getAuditActionLabel(action: string): string {
  if (action === "create_or_update_work_location") return m.audit_action_updated();
  if (action.startsWith("create") || action.endsWith("_created")) return m.audit_action_created();
  if (action.startsWith("delete")) return m.audit_action_deleted();
  if (action.endsWith("_revoked")) return m.audit_action_revoked();
  if (action.endsWith("_rotated")) return m.audit_action_rotated();
  if (action.startsWith("start")) return m.audit_action_started();
  if (action.startsWith("stop")) return m.audit_action_stopped();
  if (action.startsWith("update") || action.startsWith("set") || action.startsWith("rename"))
    return m.audit_action_updated();
  return m.audit_action_changed();
}

export function getAuditResourceLabel(type: string): string {
  const labels: Record<string, () => string> = {
    time_tracking_task: m.audit_resource_task,
    time_entry: m.audit_resource_time_entry,
    gantt_task: m.audit_resource_gantt_task,
    label: m.audit_resource_label,
    time_off_entry: m.audit_resource_time_off,
    time_off_event: m.audit_resource_time_off,
    work_location: m.audit_resource_work_location,
    user: m.audit_resource_user,
    integration_client: m.audit_resource_integration,
  };
  return (labels[type] ?? m.audit_resource_item)();
}

export function getAuditActorLabel(
  entry: AuditEntry,
  users: ReadonlyArray<{ id: number; display_name: string }>,
): string {
  if (entry.actor_label.startsWith("integration:"))
    return entry.actor_label.slice("integration:".length);
  const name = users.find((user) => user.id === entry.actor_user_id)?.display_name;
  if (name) return name;
  if (/^user:\d+$/.test(entry.actor_label))
    return m.audit_actor_user({ id: String(entry.actor_user_id ?? entry.actor_label.slice(5)) });
  return entry.actor_label || m.audit_actor_system();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const weekdays = [
  m.weekday_mon,
  m.weekday_tue,
  m.weekday_wed,
  m.weekday_thu,
  m.weekday_fri,
  m.weekday_sat,
  m.weekday_sun,
];

function formatAuditDate(value: unknown) {
  return typeof value === "string" && ISO_DATE.test(value) ? formatDisplayDate(value) : null;
}

export function isTimeOffAuditEntry(entry: AuditEntry) {
  return entry.resource_type === "time_off_entry" || entry.resource_type === "time_off_event";
}

export function getAuditResourceName(entry: AuditEntry): string {
  const resource = getAuditResourceLabel(entry.resource_type);
  if (isTimeOffAuditEntry(entry)) {
    const { entry_type, date, start_date, end_date, weekday } = entry.details;
    const type = isValidEntryType(entry_type)
      ? getEventTypeLabel([getEntryTypeFlag(entry_type)])
      : resource;
    const start = formatAuditDate(start_date);
    const end = formatAuditDate(end_date);
    const weekly = typeof weekday === "number" ? weekdays[weekday - 1]?.() : undefined;
    const when = start && end ? `${start} – ${end}` : (formatAuditDate(date) ?? weekly);
    return when ? `${type} (${when})` : type;
  }
  const name =
    entry.resource_display_name ||
    (entry.resource_type === "work_location"
      ? formatAuditDate(entry.resource_id)
      : entry.resource_id);
  return name ? `${resource} ${name}` : resource;
}
