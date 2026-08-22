import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
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
        const payload = (await response.json()) as { configured: boolean; last_used_at?: string | null };
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
    return () => { active = false; };
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

  return (
    <div className="border-top p-3">
      <h6 className="text-muted mb-2"><i className="bi bi-calendar3 me-2" />{m.calendar_feed_title()}</h6>
      <p className="text-muted small">{m.calendar_feed_description()}</p>
      <p className="text-muted small">{m.calendar_feed_client_guidance()}</p>
      <Alert variant="warning" className="small py-2">{m.calendar_feed_warning()}</Alert>
      {error ? <Alert variant="danger" className="small py-2">{error}</Alert> : null}
      {url ? (
        <>
          <Form.Control size="sm" readOnly value={url} aria-label={m.calendar_feed_url_label()} />
          <div className="d-flex gap-2 mt-2">
            <Button size="sm" onClick={() => void copy()}>{m.calendar_feed_copy()}</Button>
            <Button size="sm" variant="outline-primary" onClick={openCalendarApp}>{m.calendar_feed_open_app()}</Button>
            <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setConfirmRegenerate(true)}>{m.calendar_feed_regenerate()}</Button>
            <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => void revoke()}>{m.calendar_feed_revoke()}</Button>
          </div>
        </>
      ) : loading ? (
        <div className="text-muted small">{m.loading()}</div>
      ) : configured ? (
        <div className="d-flex flex-column align-items-start gap-2">
          <Alert variant="success" className="small py-2 mb-0">
            <div>{m.calendar_feed_configured()}</div>
            <div className="mt-1 fw-medium">
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
          <div className="d-flex gap-2">
            <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setConfirmRegenerate(true)}>{m.calendar_feed_regenerate()}</Button>
            <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => void revoke()}>{m.calendar_feed_revoke()}</Button>
          </div>
        </div>
      ) : <Button size="sm" disabled={busy} onClick={() => void rotate()}>{busy ? m.calendar_feed_generating() : m.calendar_feed_generate()}</Button>}
      <ConfirmationDialog
        isOpen={confirmRegenerate}
        title={m.calendar_feed_regenerate_confirm_title()}
        message={m.calendar_feed_regenerate_confirm_message()}
        confirmLabel={m.calendar_feed_regenerate()}
        cancelLabel={m.cancel()}
        onConfirm={() => { setConfirmRegenerate(false); void rotate(); }}
        onCancel={() => setConfirmRegenerate(false)}
        variant="warning"
        icon="bi-arrow-repeat"
      />
    </div>
  );
}
