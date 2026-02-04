import Button from "react-bootstrap/Button";
import clsx from "clsx";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "../../data/rosters";

interface Step3ScheduleSelectionProps {
  selectedSchedule: ScheduleOption | null;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onPrev: () => void;
  onNext: () => void;
  isLoading: boolean;
  isChangeScheduleFlow: boolean;
  shouldShowTeamSelection: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step3ScheduleSelection({
  selectedSchedule,
  onScheduleChange,
  onPrev,
  onNext,
  isLoading,
  isChangeScheduleFlow,
  shouldShowTeamSelection,
  firstButtonRef,
}: Step3ScheduleSelectionProps) {
  const continueLabel = isChangeScheduleFlow
    ? shouldShowTeamSelection
      ? "Continue"
      : "Save Schedule"
    : "Continue";

  return (
    <>
      <div className="text-center mb-4">
        <h5 className="mb-2">Which roster matches your team?</h5>
        <p className="text-muted">This helps us tailor your setup. You can change it later.</p>
      </div>

      <div className="mb-4">
        {SCHEDULE_OPTIONS.map((schedule) => (
          <Button
            key={schedule.value}
            variant={selectedSchedule === schedule.value ? "primary" : "outline-primary"}
            className="w-100 text-start mb-2"
            onClick={() => onScheduleChange(schedule.value)}
            disabled={isLoading || !schedule.isAvailable}
            title={!schedule.isAvailable ? "This schedule option is coming soon" : undefined}
            ref={schedule.value === "9-5" ? firstButtonRef : undefined}
          >
            <div className="fw-semibold d-flex align-items-center gap-2">
              <span>{schedule.title}</span>
              {!schedule.isAvailable && <span className="badge bg-secondary">Coming Soon</span>}
            </div>
            <small className="d-block text-muted">{schedule.description}</small>
          </Button>
        ))}
      </div>

      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          disabled={isLoading}
          className="order-2 order-sm-1"
        >
          <i
            className={clsx(
              "bi",
              isChangeScheduleFlow ? "bi-x-lg" : "bi-arrow-left",
              "me-1",
            )}
          ></i>{" "}
          {isChangeScheduleFlow ? "Cancel" : "Back"}
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={isLoading || !selectedSchedule}
          className="order-1 order-sm-2"
        >
          {continueLabel} <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
