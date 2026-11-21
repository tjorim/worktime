import { useCallback, useEffect, useState } from "react";

/** Track browser link state from the native online/offline events. */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // navigator.onLine is only a hint. A completed sync is stronger evidence
  // that the service is reachable, even if the browser has not emitted an
  // online event yet.
  const markOnline = useCallback(() => setIsOnline(true), []);

  return { isOnline, markOnline };
}
