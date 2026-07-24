import { useMemo } from "react";
import type { Label } from "@/components/timeTracking/constants";

export type LabelOption = { value: string; label: string };

export function useSelectedLabelOption(
  labels: Label[],
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
