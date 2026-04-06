import Button from "react-bootstrap/Button";
import clsx from "clsx";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import * as m from "@/paraglide/messages.js";

interface Step3ScheduleSelectionProps {
  selectedSchedule: ScheduleOption | null;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onPrev: () => void;
  onNext: () => void;
  isChangeFlow: boolean;
  shouldShowTeamSelection: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step3ScheduleSelection({
  selectedSchedule,
  onScheduleChange,
  onPrev,
  onNext,
  isChangeFlow,
  shouldShowTeamSelection,
  firstButtonRef,
}: Step3ScheduleSelectionProps) {
  const continueLabel =
    isChangeFlow && !shouldShowTeamSelection ? m.wizard_schedule_save() : m.continue();

  return (
    <>
      <div className="text-center mb-4">
        <h5 className="mb-2">{m.wizard_schedule_heading()}</h5>
        <p className="text-muted">{m.wizard_schedule_subtitle()}</p>
      </div>

      <div className="mb-4">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = selectedSchedule === schedule.value;

          return (
            <Button
              key={schedule.value}
              variant={isSelected ? "primary" : "outline-primary"}
              className="w-100 text-start mb-2"
              onClick={() => onScheduleChange(schedule.value)}
              disabled={!schedule.isAvailable}
              title={!schedule.isAvailable ? m.wizard_schedule_coming_soon_tooltip() : undefined}
              ref={schedule.value === "9-5" ? firstButtonRef : undefined}
            >
              <div className="fw-semibold d-flex align-items-center gap-2">
                <span>{schedule.title}</span>
                {!schedule.isAvailable && (
                  <span className="badge bg-secondary">{m.wizard_coming_soon_badge()}</span>
                )}
              </div>
              <small className={clsx("d-block", isSelected ? "text-white-50" : "text-muted")}>
                {schedule.description}
              </small>
            </Button>
          );
        })}
      </div>

      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button variant="outline-secondary" onClick={onPrev} className="order-2 order-sm-1">
          <i className={clsx("bi", isChangeFlow ? "bi-x-lg" : "bi-arrow-left", "me-1")}></i>{" "}
          {isChangeFlow ? m.cancel() : m.back()}
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!selectedSchedule}
          className="order-1 order-sm-2"
        >
          {continueLabel} <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
