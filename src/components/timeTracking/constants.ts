export type TimeTrackingLabel = {
  name: string;
  color: string;
};

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function isTimeTrackingLabel(value: unknown): value is TimeTrackingLabel {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const label = value as Record<string, unknown>;
  return typeof label.name === "string" && label.name.trim().length > 0 && isHexColor(label.color);
}

export function normalizeLabelName(value: string): string {
  return value.trim();
}

export const TIME_TRACKING_STORAGE_KEYS = {
  tasks: "worktime_time_tracking_tasks",
  templates: "worktime_time_tracking_templates",
  labels: "worktime_time_tracking_labels",
};
