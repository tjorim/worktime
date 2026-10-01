import { CloudCheck as CloudCheckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsRow } from "@/components/settings/SettingsParts";
import * as m from "@/paraglide/messages.js";

type BackendStatus = "checking" | "available" | "unavailable";
const BACKEND_HEALTH_TIMEOUT_MS = 5000;

export function SettingsBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  const checkHealth = useCallback(async () => {
    setStatus("checking");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/health", {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      setStatus(response.ok ? "available" : "unavailable");
    } catch {
      setStatus("unavailable");
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => void checkHealth(), [checkHealth]);

  return (
    <SettingsRow
      icon={CloudCheckIcon}
      title={m.backend_status_label()}
      description={m.backend_status_description()}
      className="tw:px-2.5"
    >
      <div className="tw:flex tw:items-center tw:gap-2">
        {status === "checking" ? (
          <Badge variant="info" role="status">
            <Spinner size="sm" aria-hidden="true" />
            {m.backend_status_checking()}
          </Badge>
        ) : (
          <Badge variant={status === "available" ? "success" : "destructive"} role="status">
            {status === "available" ? m.backend_status_available() : m.backend_status_unavailable()}
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void checkHealth()}
          disabled={status === "checking"}
        >
          {m.backend_status_refresh()}
        </Button>
      </div>
    </SettingsRow>
  );
}
