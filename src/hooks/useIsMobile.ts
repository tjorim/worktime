import { useEffect, useState } from "react";

export const MOBILE_MEDIA_QUERY = "(max-width: 767.98px)";

/**
 * Returns whether the viewport matches the shared mobile breakpoint (<= md).
 */
export function useIsMobile() {
  const getIsMobile = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  };

  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  return isMobile;
}

