import { useMemo } from "react";
import type { TimeTrackingLabel } from "../components/timeTracking/labelTypes";

export type LabelOption = { value: string; label: string };

export function useSelectedLabelOption(
  labels: TimeTrackingLabel[],
  labelId: string | undefined | null,
): LabelOption | null {
  return useMemo(() => {
    if (!labelId) {
      return null;
    }

    const selected = labels.find((label) => label.id === labelId);
    return selected ? { value: selected.id, label: selected.name } : null;
  }, [labels, labelId]);
}
