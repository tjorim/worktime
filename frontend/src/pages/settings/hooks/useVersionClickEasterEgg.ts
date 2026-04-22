import { useRef } from "react";
import * as m from "@/paraglide/messages.js";

interface UseVersionClickEasterEggParams {
  isDevMode: boolean;
  toggleDevMode: () => void;
  showInfoToast: (message: string) => void;
}

export function useVersionClickEasterEgg({
  isDevMode,
  toggleDevMode,
  showInfoToast,
}: UseVersionClickEasterEggParams) {
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);

  const handleVersionClick = () => {
    if (clickTimeoutRef.current !== null) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickCountRef.current += 1;

    if (clickCountRef.current === 3) {
      toggleDevMode();
      showInfoToast(isDevMode ? m.developer_mode_disabled() : m.developer_mode_enabled());
      clickCountRef.current = 0;
      clickTimeoutRef.current = null;
    } else {
      clickTimeoutRef.current = window.setTimeout(() => {
        clickCountRef.current = 0;
        clickTimeoutRef.current = null;
      }, 1000);
    }
  };

  const handleVersionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleVersionClick();
    }
  };

  return { handleVersionClick, handleVersionKeyDown };
}
