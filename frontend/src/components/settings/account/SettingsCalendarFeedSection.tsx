import { Calendar as CalendarIcon, RefreshCw as RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  SettingsHint,
  SettingsLoading,
  SettingsSection,
} from "@/components/settings/SettingsParts";
import { useToast } from "@/contexts/ToastContext";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { logger } from "@/utils/logger";

interface Props {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

export function SettingsCalendarFeedSection({ fetchFn }: Props) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchFn("/api/ical")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unexpected status: ${response.status}`);
        const payload = (await response.json()) as {
          configured: boolean;
          last_used_at?: string | null;
        };
        if (active) {
          setConfigured(payload.configured);
          setLastFetchedAt(payload.last_used_at ?? null);
        }
      })
      .catch((caught) => {
        logger.error("Failed to load calendar feed status:", caught);
        if (active) setError(m.calendar_feed_error());
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchFn]);

  const rotate = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchFn("/api/ical", { method: "POST" });
      if (!response.ok) throw new Error(`Unexpected status: ${response.status}`);
      const payload = (await response.json()) as { url_path: string };
      setUrl(new URL(payload.url_path, window.location.origin).toString());
      setConfigured(true);
      setLastFetchedAt(null);
    } catch (caught) {
      logger.error("Failed to rotate calendar feed:", caught);
      setError(m.calendar_feed_error());
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchFn("/api/ical", { method: "DELETE" });
      if (!response.ok) throw new Error(`Unexpected status: ${response.status}`);
      setUrl(null);
      setConfigured(false);
      setLastFetchedAt(null);
      toast?.showSuccess(m.calendar_feed_revoked());
    } catch (caught) {
      logger.error("Failed to revoke calendar feed:", caught);
      setError(m.calendar_feed_error());
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast?.showSuccess(m.calendar_feed_copied());
    } catch {
      toast?.showError(m.calendar_feed_copy_failed());
    }
  };

  const openCalendarApp = () => {
    if (!url) return;
    window.location.assign(url.replace(/^https?:/, "webcal:"));
  };

  const regenerateButton = (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmRegenerate(true)}>
      {m.calendar_feed_regenerate()}
    </Button>
  );
  const revokeButton = (
    <Button variant="destructive" size="sm" disabled={busy} onClick={() => void revoke()}>
      {m.calendar_feed_revoke()}
    </Button>
  );

  return (
    <SettingsSection icon={CalendarIcon} title={m.calendar_feed_title()}>
      <div className="flex flex-col gap-2">
        <SettingsHint>{m.calendar_feed_description()}</SettingsHint>
        <SettingsHint>{m.calendar_feed_client_guidance()}</SettingsHint>
        <Alert variant="warning">{m.calendar_feed_warning()}</Alert>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {url ? (
          <>
            <Input readOnly value={url} aria-label={m.calendar_feed_url_label()} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy()}>
                {m.calendar_feed_copy()}
              </Button>
              <Button variant="secondary" size="sm" onClick={openCalendarApp}>
                {m.calendar_feed_open_app()}
              </Button>
              {regenerateButton}
              {revokeButton}
            </div>
          </>
        ) : loading ? (
          <SettingsLoading>{m.loading()}</SettingsLoading>
        ) : configured ? (
          <div className="flex flex-col items-start gap-2">
            <Alert variant="success">
              <div>{m.calendar_feed_configured()}</div>
              <div className="font-medium">
                {lastFetchedAt
                  ? m.calendar_feed_last_fetched({
                      date: new Intl.DateTimeFormat(getLocale(), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(lastFetchedAt)),
                    })
                  : m.calendar_feed_never_fetched()}
              </div>
            </Alert>
            <div className="flex flex-wrap gap-2">
              {regenerateButton}
              {revokeButton}
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" disabled={busy} onClick={() => void rotate()}>
              {busy ? m.calendar_feed_generating() : m.calendar_feed_generate()}
            </Button>
          </div>
        )}
      </div>
      <ConfirmationDialog
        isOpen={confirmRegenerate}
        title={m.calendar_feed_regenerate_confirm_title()}
        message={m.calendar_feed_regenerate_confirm_message()}
        confirmLabel={m.calendar_feed_regenerate()}
        cancelLabel={m.cancel()}
        onConfirm={() => {
          setConfirmRegenerate(false);
          void rotate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
        variant="warning"
        icon={RefreshCwIcon}
      />
    </SettingsSection>
  );
}
