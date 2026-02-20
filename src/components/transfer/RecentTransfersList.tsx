import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import type { TransferInfo } from "../../hooks/useTransferCalculations";
import { formatDisplayDate, formatYYWWD } from "../../utils/dateTimeUtils";
import type { NullableScheduleOption } from "../../utils/shiftCalculations";
import { getShift } from "../../utils/shiftCalculations";
import { EmptyState } from "../shared/EmptyState";

interface RecentTransfersListProps {
  transfers: TransferInfo[];
  myTeam: number | null;
  title?: string;
  scheduleType?: NullableScheduleOption;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  error?: string | null;
}

export function RecentTransfersList({
  transfers,
  myTeam,
  title = "Recent Transfers",
  scheduleType,
  emptyTitle = "No Transfers Found",
  emptyDescription = "No transfers available for this section.",
  isLoading = false,
  error = null,
}: RecentTransfersListProps) {
  return (
    <Card className="h-100">
      <Card.Header className="fw-semibold d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <span>
          <i className="bi bi-arrow-left-right me-2" aria-hidden="true"></i>
          {title}
        </span>
        <Badge bg="secondary">{transfers.length}</Badge>
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner animation="border" size="sm" role="status" />
            Loading transfer history...
          </div>
        ) : error ? (
          <Alert variant="danger" className="mb-0 py-2">
            {error}
          </Alert>
        ) : transfers.length === 0 ? (
          <EmptyState icon="bi-calendar-x" title={emptyTitle} description={emptyDescription} />
        ) : (
          <ListGroup variant="flush">
            {transfers.map((transfer, index) => {
              const fromShift = getShift(transfer.fromShiftType, scheduleType);
              const toShift = getShift(transfer.toShiftType, scheduleType);

              return (
                <ListGroup.Item
                  key={`${transfer.date.toISOString()}-${transfer.fromTeam}-${transfer.toTeam}-${transfer.fromShiftType}-${transfer.toShiftType}-${transfer.type}-${index}`}
                  className="px-0 d-flex justify-content-between align-items-start gap-2 flex-wrap"
                >
                  <div>
                    <div className="fw-semibold">{formatYYWWD(transfer.date)}</div>
                    <small className="text-muted">
                      {formatDisplayDate(transfer.date.toDate())}
                    </small>
                    <div className="small mt-1">
                      Team {transfer.fromTeam} → Team {transfer.toTeam}
                    </div>
                  </div>
                  <div className="d-flex flex-column align-items-start align-items-sm-end">
                    <Badge bg={transfer.type === "handover" ? "success" : "info"} className="mb-1">
                      {transfer.type === "handover" ? "Handover" : "Takeover"}
                    </Badge>
                    <small className="text-muted text-nowrap">
                      {fromShift.name} → {toShift.name}
                    </small>
                    {myTeam && <small className="text-muted">Your team: Team {myTeam}</small>}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}
