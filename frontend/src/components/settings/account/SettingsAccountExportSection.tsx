import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsHint, SettingsSection } from "@/components/settings/SettingsParts";
import { ApiError, getErrorMessage } from "@/utils/apiError";
import { logger } from "@/utils/logger";
import * as m from "@/paraglide/messages.js";

interface SettingsAccountExportSectionProps {
  accountId: number | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

/** Download the full server-side account export (`GET /api/users/{id}/export`) as a JSON file. */
export function SettingsAccountExportSection({
  accountId,
  fetchFn,
}: SettingsAccountExportSectionProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (accountId === null) return;
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetchFn(`/api/users/${accountId}/export`);
      if (!response.ok) throw await ApiError.fromResponse(response);
      const blob = new Blob([await response.text()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "worktime-account-data.json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      logger.error("Failed to export account data:", caught);
      setError(getErrorMessage(caught, m.account_export_failed()));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SettingsSection icon={DownloadIcon} title={m.account_export_title()}>
      <div className="flex flex-col gap-2">
        <SettingsHint>{m.account_export_description()}</SettingsHint>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting || accountId === null}
            aria-describedby={accountId === null ? "account-export-help" : undefined}
            onClick={() => void download()}
          >
            <Icon icon={DownloadIcon} />
            {isExporting ? m.account_export_busy() : m.account_export_btn()}
          </Button>
        </div>
        {accountId === null ? (
          <SettingsHint id="account-export-help">{m.account_export_unavailable()}</SettingsHint>
        ) : null}
      </div>
    </SettingsSection>
  );
}
