import { useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { useSettings } from "../../contexts/SettingsContext";
import { dayjs, formatYYWWD, getLocalizedShiftTime } from "../../utils/dateTimeUtils";
import type { NullableScheduleOption, UpcomingShiftResult } from "../../utils/shiftCalculations";
import { getNextShift } from "../../utils/shiftCalculations";
import { EmptyState } from "../shared/EmptyState";

interface UpcomingShiftsListProps {
  teamNumber: number | null;
  scheduleType: NullableScheduleOption;
  fromDate?: string;
  itemCount?: number;
  isLoading?: boolean;
  error?: string | null;
}

export function UpcomingShiftsList({
  teamNumber,
  scheduleType,
  fromDate,
  itemCount = 6,
  isLoading = false,
  error = null,
}: UpcomingShiftsListProps) {
  const {
    settings: { timeFormat },
  } = useSettings();

  const upcomingShifts = useMemo(() => {
    if (!teamNumber || itemCount <= 0) {
      return [];
    }

    const shifts: UpcomingShiftResult[] = [];
    let cursor = dayjs(fromDate ?? undefined);

    for (let i = 0; i < itemCount; i++) {
      const nextShift = getNextShift(cursor, teamNumber, scheduleType);
      if (!nextShift) {
        break;
      }
      shifts.push(nextShift);
      cursor = nextShift.date;
    }

    return shifts;
  }, [fromDate, itemCount, scheduleType, teamNumber]);

  return (
    <Card className="h-100">
      <Card.Header className="fw-semibold d-flex align-items-center gap-2">
        <i className="bi bi-clock-history" aria-hidden="true"></i>
        Upcoming Shifts
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner animation="border" size="sm" role="status" />
            Loading upcoming shifts...
          </div>
        ) : error ? (
          <Alert variant="danger" className="mb-0 py-2">
            {error}
          </Alert>
        ) : upcomingShifts.length === 0 ? (
          <EmptyState
            icon="bi-calendar-x"
            title="No Upcoming Shifts"
            description="No upcoming shifts were found for your team."
          />
        ) : (
          <ListGroup variant="flush">
            {upcomingShifts.map((entry) => (
              <ListGroup.Item
                key={`${entry.code}-${entry.date.toISOString()}`}
                className="px-0 d-flex justify-content-between align-items-start gap-2 flex-wrap"
              >
                <div>
                  <div className="fw-semibold">{formatYYWWD(entry.date)}</div>
                  <small className="text-muted">{entry.shift.name}</small>
                </div>
                <small className="text-muted text-nowrap">
                  {getLocalizedShiftTime(entry.shift.start, null, timeFormat) ?? "No start time"}
                </small>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}
