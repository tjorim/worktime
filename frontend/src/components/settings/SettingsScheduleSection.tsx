import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { hasMultipleTeams } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";
import { SettingsHdayHelper } from "@/components/settings/SettingsHdayHelper";
import { TeamSelector } from "@/components/shared/TeamSelector";

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
        <div className="mb-3">
          <TeamSelector
            scheduleType={scheduleType}
            selectedTeam={myTeam}
            onChange={onTeamChange}
            label={m.select_team_label()}
            ariaLabel={m.select_team_label()}
          />
          {myTeam === null && <small className="text-muted">{m.settings_no_team_selected()}</small>}
        </div>
      )}

      <hr className="my-4" />
      <SettingsHdayHelper />
    </div>
  );
}
