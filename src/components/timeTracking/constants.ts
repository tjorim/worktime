export const TIME_TRACKING_TAGS = [
  "Development",
  "Support",
  "Meeting",
  "Review",
  "Documentation",
  "Training",
  "Lunch",
  "Other",
] as const;

export type TimeTrackingTag = (typeof TIME_TRACKING_TAGS)[number];

const TIME_TRACKING_TAG_SET: ReadonlySet<string> = new Set(TIME_TRACKING_TAGS);

export function isTimeTrackingTag(value: unknown): value is TimeTrackingTag {
  return typeof value === "string" && TIME_TRACKING_TAG_SET.has(value);
}

export const TIME_TRACKING_STORAGE_KEYS = {
  tasks: "worktime_time_tracking_tasks",
  templates: "worktime_time_tracking_templates",
};
