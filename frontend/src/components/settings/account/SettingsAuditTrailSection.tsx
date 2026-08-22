import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
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
    <div className="border-bottom">
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-clock-history me-2"></i>
          {teamWide ? m.audit_trail_admin_title() : m.audit_trail_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item>
            <p className="text-muted small mb-2">
              {teamWide ? m.audit_trail_admin_description() : m.audit_trail_description()}
            </p>
            {isLoading ? (
              <div className="d-flex align-items-center gap-2 text-muted small">
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>{m.audit_trail_loading()}</span>
              </div>
            ) : error && entries.length === 0 ? (
              <Alert variant="warning" className="mb-0 py-2">{error}</Alert>
            ) : entries.length === 0 ? (
              <p className="text-muted small mb-0">{m.audit_trail_empty()}</p>
            ) : (
              <>
                <ListGroup className="mb-2">
                  {entries.map((entry) => {
                    const hasDetails = Object.keys(entry.details).length > 0;
                    return (
                      <ListGroup.Item key={entry.id} className="px-3 py-2">
                        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-2 gap-md-3">
                          <div className="small">
                            <div className="fw-medium text-capitalize">
                              {humanize(entry.action)} · {humanize(entry.resource_type)} {entry.resource_id}
                            </div>
                            <div className="text-muted">
                              {entry.actor_label} ({humanize(entry.auth_source)})
                            </div>
                            {hasDetails ? (
                              <details className="mt-1">
                                <summary className="text-muted">{m.audit_trail_details()}</summary>
                                <code className="small text-break">{JSON.stringify(entry.details)}</code>
                              </details>
                            ) : null}
                          </div>
                          <time className="small text-muted text-nowrap" dateTime={entry.created_at}>
                            {formatTimestamp(entry.created_at)}
                          </time>
                        </div>
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
                {error ? <Alert variant="warning" className="py-2">{error}</Alert> : null}
                {hasMore ? (
                  <Button variant="outline-secondary" size="sm" disabled={isLoadingMore} onClick={onLoadMore}>
                    {isLoadingMore ? m.audit_trail_loading_more() : m.audit_trail_load_more()}
                  </Button>
                ) : null}
              </>
            )}
          </ListGroup.Item>
        </ListGroup>
      </div>
    </div>
  );
}
