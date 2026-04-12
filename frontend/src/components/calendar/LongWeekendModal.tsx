import type { ChangeEvent } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import type { LongWeekend } from "@/types/longWeekend";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";

interface LongWeekendModalProps {
  show: boolean;
  year: number;
  bridgeDays: number;
  periods: LongWeekend[];
  loading: boolean;
  error: string | null;
  onHide: () => void;
  onBridgeDaysChange: (days: number) => void;
}

/**
 * Modal showing long weekend opportunities for a calendar year.
 *
 * Lets users choose how many bridge days they are willing to take
 * and lists all periods where a long weekend is possible.
 * Marked periods are also highlighted in the month calendar.
 */
export function LongWeekendModal({
  show,
  year,
  bridgeDays,
  periods,
  loading,
  error,
  onHide,
  onBridgeDaysChange,
}: LongWeekendModalProps) {
  const locale = getLocale();

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(dayjs(iso).toDate());

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>
          <span className="me-2" aria-hidden="true">
            🏖️
          </span>
          {m.long_weekend_modal_title({ year: String(year) })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-flex align-items-center gap-2 mb-3">
          <Form.Label htmlFor="lw-bridge-days" className="mb-0 text-nowrap">
            {m.long_weekend_bridge_days_label()}
          </Form.Label>
          <Form.Select
            id="lw-bridge-days"
            size="sm"
            style={{ maxWidth: "8rem" }}
            value={bridgeDays}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              onBridgeDaysChange(Number(e.target.value))
            }
            aria-label={m.long_weekend_bridge_days_label()}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Form.Select>
        </div>

        {loading && (
          <div className="d-flex justify-content-center py-4">
            <Spinner animation="border" size="sm" role="status">
              <span className="visually-hidden">{m.loading()}</span>
            </Spinner>
          </div>
        )}

        {!loading && error && (
          <p className="text-danger small mb-0">
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>
            {error}
          </p>
        )}

        {!loading && !error && periods.length === 0 && (
          <p className="text-muted small mb-0">
            {m.long_weekend_modal_empty({ year: String(year) })}
          </p>
        )}

        {!loading && !error && periods.length > 0 && (
          <ListGroup variant="flush">
            {periods.map((period) => (
              <ListGroup.Item key={period.startDate} className="px-0">
                <div className="d-flex align-items-start gap-2">
                  <span aria-hidden="true" className="mt-1">
                    {period.needBridgeDay ? "🌉" : "🏖️"}
                  </span>
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="fw-medium">
                        {formatDate(period.startDate)} – {formatDate(period.endDate)}
                      </span>
                      <Badge bg="secondary" pill>
                        {period.dayCount}d
                      </Badge>
                    </div>
                    {period.needBridgeDay && period.bridgeDays.length > 0 && (
                      <div className="text-muted small mt-1">
                        {m.long_weekend_bridge_day_needed({
                          date: period.bridgeDays.map(formatDate).join(", "),
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
