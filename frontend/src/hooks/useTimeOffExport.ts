import { useCallback } from "react";
import { UploadIcon } from "lucide-react";
import { useEventStore } from "@/app/providers/EventStoreContext";
import { useToast } from "@/app/providers/ToastContext";
import * as m from "@/paraglide/messages.js";

export function useTimeOffExport() {
  const { entries, rawText } = useEventStore();
  const toast = useToast();

  return useCallback(() => {
    if (entries.length === 0) {
      toast.showError(m.timeoff_no_events_export());
      return;
    }

    const url = URL.createObjectURL(new Blob([rawText], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "timeoff.hday";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast.showSuccess(m.timeoff_exported(), UploadIcon);
  }, [entries.length, rawText, toast]);
}
