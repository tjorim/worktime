import { History as HistoryIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  SettingsHint,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsSection,
} from "@/components/settings/SettingsParts";
import type { AuditEntry } from "@/pages/settings/hooks/useSettingsAuditTrail";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

interface SettingsAuditTrailSectionProps {
  entries: AuditEntry[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  teamWide?: boolean;
  onLoadMore: () => void;
}

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(getLocale() === "nl" ? "nl-NL" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const humanize = (value: string): string => value.replaceAll("_", " ");

export function SettingsAuditTrailSection({
  entries,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  teamWide = false,
  onLoadMore,
}: SettingsAuditTrailSectionProps) {
  return (
    <SettingsSection
      icon={HistoryIcon}
      title={teamWide ? m.audit_trail_admin_title() : m.audit_trail_title()}
    >
      <SettingsHint className="mb-2">
        {teamWide ? m.audit_trail_admin_description() : m.audit_trail_description()}
      </SettingsHint>
      {isLoading ? (
        <SettingsLoading>{m.audit_trail_loading()}</SettingsLoading>
      ) : error && entries.length === 0 ? (
        <Alert variant="warning">{error}</Alert>
      ) : entries.length === 0 ? (
        <SettingsHint>{m.audit_trail_empty()}</SettingsHint>
      ) : (
        <div className="flex flex-col gap-2">
          <SettingsList className="rounded-lg border border-border">
            {entries.map((entry) => {
              const hasDetails = Object.keys(entry.details).length > 0;
              return (
                <SettingsItem
                  key={entry.id}
                  className="flex flex-col items-start justify-between gap-2 px-3 py-2 first:pt-2 last:pb-2 md:flex-row md:gap-3"
                >
                  <div className="min-w-0 text-sm">
                    <div className="font-medium capitalize">
                      {humanize(entry.action)} · {humanize(entry.resource_type)} {entry.resource_id}
                    </div>
                    <div className="text-muted-foreground">
                      {entry.actor_label} ({humanize(entry.auth_source)})
                    </div>
                    {hasDetails ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">
                          {m.audit_trail_details()}
                        </summary>
                        <code className="text-sm break-all">{JSON.stringify(entry.details)}</code>
                      </details>
                    ) : null}
                  </div>
                  <time
                    className="text-sm whitespace-nowrap text-muted-foreground"
                    dateTime={entry.created_at}
                  >
                    {formatTimestamp(entry.created_at)}
                  </time>
                </SettingsItem>
              );
            })}
          </SettingsList>
          {error ? <Alert variant="warning">{error}</Alert> : null}
          {hasMore ? (
            <div>
              <Button variant="outline" size="sm" disabled={isLoadingMore} onClick={onLoadMore}>
                {isLoadingMore ? m.audit_trail_loading_more() : m.audit_trail_load_more()}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
