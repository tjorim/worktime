import type { TimeTrackingLabel, TimeTrackingLabelInput } from "./labelTypes";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function isTimeTrackingLabelInput(value: unknown): value is TimeTrackingLabelInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const label = value as Record<string, unknown>;
  const hasValidId =
    label.id === undefined || (typeof label.id === "string" && label.id.length > 0);
  return (
    hasValidId &&
    typeof label.name === "string" &&
    label.name.trim().length > 0 &&
    isHexColor(label.color)
  );
}

export function sanitizeLabels(labels: unknown[]): TimeTrackingLabel[] {
  const seen = new Set<string>();
  const sanitized: TimeTrackingLabel[] = [];

  labels.forEach((label) => {
    if (!isTimeTrackingLabelInput(label)) {
      return;
    }
    const name = normalizeLabelName(label.name);
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({
      id: typeof label.id === "string" ? label.id : crypto.randomUUID(),
      name,
      color: label.color,
    });
  });

  return sanitized;
}

export function buildLabelNameMap(labels: TimeTrackingLabel[]): Record<string, string> {
  return labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.name;
    return map;
  }, {});
}

export function buildLabelColorMap(labels: TimeTrackingLabel[]): Record<string, string> {
  return labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.color;
    return map;
  }, {});
}

export function normalizeLabelName(value: string): string {
  return value.trim();
}
