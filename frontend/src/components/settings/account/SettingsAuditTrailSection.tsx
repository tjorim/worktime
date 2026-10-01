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
      <SettingsHint className="tw:mb-2">
        {teamWide ? m.audit_trail_admin_description() : m.audit_trail_description()}
      </SettingsHint>
      {isLoading ? (
        <SettingsLoading>{m.audit_trail_loading()}</SettingsLoading>
      ) : error && entries.length === 0 ? (
        <Alert variant="warning">{error}</Alert>
      ) : entries.length === 0 ? (
        <SettingsHint>{m.audit_trail_empty()}</SettingsHint>
      ) : (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <SettingsList className="tw:rounded-lg tw:border tw:border-border">
            {entries.map((entry) => {
              const hasDetails = Object.keys(entry.details).length > 0;
              return (
                <SettingsItem
                  key={entry.id}
                  className="tw:flex tw:flex-col tw:items-start tw:justify-between tw:gap-2 tw:px-3 tw:py-2 tw:first:pt-2 tw:last:pb-2 tw:md:flex-row tw:md:gap-3"
                >
                  <div className="tw:min-w-0 tw:text-sm">
                    <div className="tw:font-medium tw:capitalize">
                      {humanize(entry.action)} · {humanize(entry.resource_type)} {entry.resource_id}
                    </div>
                    <div className="tw:text-muted-foreground">
                      {entry.actor_label} ({humanize(entry.auth_source)})
                    </div>
                    {hasDetails ? (
                      <details className="tw:mt-1">
                        <summary className="tw:cursor-pointer tw:text-muted-foreground">
                          {m.audit_trail_details()}
                        </summary>
                        <code className="tw:text-sm tw:break-all">
                          {JSON.stringify(entry.details)}
                        </code>
                      </details>
                    ) : null}
                  </div>
                  <time
                    className="tw:text-sm tw:whitespace-nowrap tw:text-muted-foreground"
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
