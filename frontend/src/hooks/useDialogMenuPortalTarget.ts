import { createContext, useContext } from "react";

export const DialogMenuPortalContext = createContext<HTMLElement | null>(null);

export function useDialogMenuPortalTarget() {
  return useContext(DialogMenuPortalContext);
}
