import { useEffect, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import * as m from "@/paraglide/messages";

/** Compare serialized content, so equivalent refreshes do not invalidate drafts. */
export function useJsonDraft(source: string) {
  const router = useRouter({ warn: false });
  const [base, setBase] = useState(source);
  const [value, setValue] = useState(source);
  const dirty = value !== base;
  if (source !== base && !dirty) {
    setBase(source);
    setValue(source);
  }
  useEffect(() => {
    if (!dirty || !router) return;
    return router.history.block({
      blockerFn: () => !window.confirm(m.tt_json_leave()),
      enableBeforeUnload: false,
    });
  }, [dirty, router]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  return {
    value,
    setValue,
    conflict: source !== base && dirty,
    reconcile: () => setBase(source),
    saved: () => {
      setBase(source);
      setValue(source);
    },
  };
}
