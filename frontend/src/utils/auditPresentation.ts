import type { AuditEntry } from "@/pages/settings/hooks/useSettingsAuditTrail";
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
