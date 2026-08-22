import { useMemo } from "react";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ReactElement } from "react";
import ReactSelect from "react-select";
import type { Label } from "./constants";
import type { GanttTask } from "@/types/gantt";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import {
  useSelectedGanttTaskOption,
  type GanttTaskOption,
} from "@/hooks/useSelectedGanttTaskOption";
import * as m from "@/paraglide/messages.js";

type TaskEntryFormProps = {
  labels: Label[];
  text: string;
  onTextChange: (text: string) => void;
  label: string;
  onLabelChange: (label: string) => void;
  ganttTasks?: GanttTask[];
  ganttTaskId?: string;
  onGanttTaskChange?: (ganttTaskId: string) => void;
  showGanttPicker?: boolean;
  start: string;
  onStartChange: (start: string) => void;
  stop: string;
  onStopChange: (stop: string) => void;
  canSubmit: boolean;
  canStartNow: boolean;
  isTimerRunning?: boolean;
  timerElapsed?: string;
  startDisabledReason?: string;
  addDisabledReason?: string;
  onSubmit: () => void;
  onStartNow: () => void;
  onStopNow?: () => void;
  onCreateLabel?: () => void;
};

export function TaskEntryForm({
  labels,
  text,
  onTextChange,
  label,
  onLabelChange,
  ganttTasks = [],
  ganttTaskId = "",
  onGanttTaskChange = () => undefined,
  showGanttPicker = false,
  start,
  onStartChange,
  stop,
  onStopChange,
  canSubmit,
  canStartNow,
  isTimerRunning,
  timerElapsed,
  startDisabledReason,
  addDisabledReason,
  onSubmit,
  onStartNow,
  onStopNow,
  onCreateLabel,
}: TaskEntryFormProps) {
  const selectedLabelOption = useSelectedLabelOption(labels, label);
  const selectedGanttTaskOption = useSelectedGanttTaskOption(ganttTasks, ganttTaskId);
  const ganttTaskOptions = useMemo(
    () => ganttTasks.map((task) => ({ value: task.id, label: task.name })),
    [ganttTasks],
  );
  const primaryFieldWidth = showGanttPicker ? 2 : 3;

  const renderDisabledTooltipButton = (
    buttonKey: string,
    reason: string | undefined,
    button: ReactElement,
  ) => {
    if (!reason) {
      return button;
    }

    const tooltipId = `${buttonKey}-tooltip`;
    return (
      <OverlayTrigger
        trigger={["hover", "focus"]}
        overlay={<Tooltip id={tooltipId}>{reason}</Tooltip>}
      >
        <span className="w-100 d-inline-block" tabIndex={0} aria-describedby={tooltipId}>
          {button}
        </span>
      </OverlayTrigger>
    );
  };

  return (
    <>
      {isTimerRunning !== undefined && (
        <p className="small text-muted mb-2">{m.tt_quick_timer_desc()}</p>
      )}
      <Row className="g-3 align-items-end">
        <Col md={primaryFieldWidth}>
          <Form.Group controlId="timeTrackerTask">
            <Form.Label>{m.form_task()}</Form.Label>
            <Form.Control
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              aria-required="true"
            />
          </Form.Group>
        </Col>
        <Col md={primaryFieldWidth}>
          <Form.Group controlId="timeTrackerLabel">
            <Form.Label>{m.form_label()}</Form.Label>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="timeTrackerLabel"
              isDisabled={labels.length === 0}
              placeholder={labels.length === 0 ? m.tt_add_labels_first() : m.tt_choose_label()}
              aria-describedby={labels.length === 0 ? "timeTrackerLabelHelp" : undefined}
              options={labels.map((item) => ({ value: item.id, label: item.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onLabelChange(selected?.value ?? "")}
              classNames={bootstrapSelectClassNames}
            />
            {labels.length === 0 && (
              <Form.Text id="timeTrackerLabelHelp" muted className="d-block">
                {m.tt_add_labels_first_task_help()}
                {onCreateLabel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 ms-1 align-baseline"
                    onClick={onCreateLabel}
                  >
                    {m.tt_create_label_action()}
                  </Button>
                )}
              </Form.Text>
            )}
          </Form.Group>
        </Col>
        {showGanttPicker && (
          <Col md={primaryFieldWidth}>
            <Form.Group controlId="timeTrackerGanttTask">
              <Form.Label>{m.tt_gantt_task()}</Form.Label>
              <ReactSelect<GanttTaskOption>
                unstyled
                isClearable
                isSearchable
                inputId="timeTrackerGanttTask"
                placeholder={m.tt_no_gantt_task()}
                options={ganttTaskOptions}
                value={selectedGanttTaskOption}
                onChange={(selected) => onGanttTaskChange(selected?.value ?? "")}
                classNames={bootstrapSelectClassNames}
              />
            </Form.Group>
          </Col>
        )}
        <Col md={2}>
          <Form.Group controlId="timeTrackerStart">
            <Form.Label>{m.form_start()}</Form.Label>
            <Form.Control
              type="time"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              aria-required="true"
            />
          </Form.Group>
        </Col>
        <Col md={2}>
          <Form.Group controlId="timeTrackerStop">
            <Form.Label>{m.form_stop()}</Form.Label>
            <Form.Control
              type="time"
              value={stop}
              onChange={(e) => onStopChange(e.target.value)}
              aria-required="true"
            />
          </Form.Group>
        </Col>
        <Col md={2}>
          <div className="d-grid gap-2">
            {renderDisabledTooltipButton(
              "start-now",
              !isTimerRunning && !canStartNow ? startDisabledReason : undefined,
              <Button
                variant={isTimerRunning ? "danger" : "success"}
                className="w-100"
                onClick={isTimerRunning ? (onStopNow ?? onStartNow) : onStartNow}
                disabled={!isTimerRunning && !canStartNow}
              >
                {isTimerRunning ? m.tt_stop_timer() : m.tt_start_now()}
                {isTimerRunning !== undefined && (
                  <>
                    {" "}· {isTimerRunning ? m.tt_running_status() : m.tt_idle_status()}
                    {isTimerRunning && timerElapsed ? ` ${timerElapsed}` : ""}
                  </>
                )}
              </Button>,
            )}
            {renderDisabledTooltipButton(
              "add-task",
              !canSubmit ? addDisabledReason : undefined,
              <Button className="w-100" onClick={onSubmit} disabled={!canSubmit}>
                {m.tt_add_task()}
              </Button>,
            )}
          </div>
        </Col>
      </Row>
    </>
  );
}
