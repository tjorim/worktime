import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { getTeamCountForOption, hasMultipleTeams } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";

interface SettingsScheduleSectionProps {
  scheduleType: ScheduleOption | null;
  myTeam: number | null;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onTeamChange: (team: number) => void;
}

export function SettingsScheduleSection({
  scheduleType,
  myTeam,
  onScheduleChange,
  onTeamChange,
}: SettingsScheduleSectionProps) {
  return (
    <div className="p-3">
      <h6 className="text-muted mb-3">
        <i className="bi bi-calendar-week me-2"></i>
        {m.select_schedule_label()}
      </h6>
      <ListGroup variant="flush" className="mb-3">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = scheduleType === schedule.value;
          const item = (
            <ListGroup.Item
              key={schedule.value}
              action
              active={isSelected}
              disabled={!schedule.isAvailable}
              onClick={() => schedule.isAvailable && onScheduleChange(schedule.value)}
              className="d-flex justify-content-between align-items-center"
            >
              <div>
                <div className="fw-semibold d-flex align-items-center gap-2">
                  {schedule.title}
                  {!schedule.isAvailable && (
                    <Badge bg="secondary" className="fw-normal" style={{ fontSize: "0.65em" }}>
                      {m.wizard_coming_soon_badge()}
                    </Badge>
                  )}
                </div>
                <small className={isSelected ? "text-white-50" : "text-muted"}>
                  {schedule.description}
                </small>
              </div>
              {isSelected && <i className="bi bi-check-lg ms-2 flex-shrink-0" aria-hidden="true" />}
            </ListGroup.Item>
          );
          return schedule.isAvailable ? (
            item
          ) : (
            <OverlayTrigger
              key={schedule.value}
              placement="top"
              overlay={<Tooltip>{m.wizard_schedule_coming_soon_tooltip()}</Tooltip>}
            >
              <span>{item}</span>
            </OverlayTrigger>
          );
        })}
      </ListGroup>

      {scheduleType && hasMultipleTeams(scheduleType) && (
        <>
          <h6 className="text-muted mb-3">
            <i className="bi bi-people me-2"></i>
            {m.select_team_label()}
          </h6>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {Array.from({ length: getTeamCountForOption(scheduleType) }, (_, i) => i + 1).map(
              (team) => (
                <Button
                  key={team}
                  size="sm"
                  variant={myTeam === team ? "primary" : "outline-secondary"}
                  aria-pressed={myTeam === team}
                  aria-label={m.wizard_team_btn_aria({ team: String(team) })}
                  onClick={() => onTeamChange(team)}
                >
                  {m.wizard_team_btn_label({ team: String(team) })}
                </Button>
              ),
            )}
          </div>
          {myTeam === null && <small className="text-muted">{m.settings_no_team_selected()}</small>}
        </>
      )}
    </div>
  );
}
