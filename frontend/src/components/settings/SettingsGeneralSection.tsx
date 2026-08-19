import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { getTeamCountForOption, hasMultipleTeams } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";

interface SettingsGeneralSectionProps {
  scheduleType: ScheduleOption | null;
  myTeam: number | null;
  timeFormat: "12h" | "24h";
  theme: "light" | "dark" | "auto";
  locale: "en" | "nl";
  notificationsEnabled: boolean;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onTeamChange: (team: number) => void;
  onTimeFormatChange: (format: "12h" | "24h") => void;
  onThemeChange: (theme: "light" | "dark" | "auto") => void;
  onLocaleChange: (locale: "en" | "nl") => void;
  onNotificationsChange: (enabled: boolean) => void;
}

export function SettingsGeneralSection({
  scheduleType,
  myTeam,
  timeFormat,
  theme,
  locale,
  notificationsEnabled,
  onScheduleChange,
  onTeamChange,
  onTimeFormatChange,
  onThemeChange,
  onLocaleChange,
  onNotificationsChange,
}: SettingsGeneralSectionProps) {
  return (
    <div className="border-bottom">
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
            return schedule.isAvailable ? item : (
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
              {Array.from({ length: getTeamCountForOption(scheduleType) }, (_, i) => i + 1).map((team) => (
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
              ))}
            </div>
            {myTeam === null && <small className="text-muted">{m.settings_no_team_selected()}</small>}
          </>
        )}
      </div>
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-sliders me-2"></i>
          {m.preferences_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">{m.time_format_label()}</div>
                <small className="text-muted">{m.time_format_description()}</small>
              </div>
              <ButtonGroup size="sm" aria-label={m.time_format_label()}>
                <Button
                  variant={timeFormat === "24h" ? "primary" : "outline-secondary"}
                  aria-pressed={timeFormat === "24h"}
                  onClick={() => onTimeFormatChange("24h")}
                >
                  24h
                </Button>
                <Button
                  variant={timeFormat === "12h" ? "primary" : "outline-secondary"}
                  aria-pressed={timeFormat === "12h"}
                  onClick={() => onTimeFormatChange("12h")}
                >
                  12h
                </Button>
              </ButtonGroup>
            </div>
          </ListGroup.Item>
          <ListGroup.Item>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">{m.theme_label()}</div>
                <small className="text-muted">{m.theme_description()}</small>
              </div>
              <ButtonGroup size="sm" aria-label={m.theme_label()}>
                <Button
                  variant={theme === "auto" ? "primary" : "outline-secondary"}
                  aria-pressed={theme === "auto"}
                  onClick={() => onThemeChange("auto")}
                >
                  <i className="bi bi-circle-half me-1"></i>
                  {m.theme_auto()}
                </Button>
                <Button
                  variant={theme === "light" ? "primary" : "outline-secondary"}
                  aria-pressed={theme === "light"}
                  onClick={() => onThemeChange("light")}
                >
                  <i className="bi bi-sun me-1"></i>
                  {m.theme_light()}
                </Button>
                <Button
                  variant={theme === "dark" ? "primary" : "outline-secondary"}
                  aria-pressed={theme === "dark"}
                  onClick={() => onThemeChange("dark")}
                >
                  <i className="bi bi-moon me-1"></i>
                  {m.theme_dark()}
                </Button>
              </ButtonGroup>
            </div>
          </ListGroup.Item>
          <ListGroup.Item>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">{m.language_label()}</div>
                <small className="text-muted">{m.language_description()}</small>
              </div>
              <ButtonGroup size="sm" aria-label={m.language_label()}>
                <Button
                  variant={locale === "en" ? "primary" : "outline-secondary"}
                  aria-pressed={locale === "en"}
                  onClick={() => onLocaleChange("en")}
                >
                  EN
                </Button>
                <Button
                  variant={locale === "nl" ? "primary" : "outline-secondary"}
                  aria-pressed={locale === "nl"}
                  onClick={() => onLocaleChange("nl")}
                >
                  NL
                </Button>
              </ButtonGroup>
            </div>
          </ListGroup.Item>
          <ListGroup.Item>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">{m.notifications_label()}</div>
                <small className="text-muted">{m.notifications_description()}</small>
              </div>
              <Form.Check
                type="switch"
                id="toggle-notifications"
                checked={notificationsEnabled}
                onChange={(event) => onNotificationsChange(event.target.checked)}
                aria-label={m.notifications_label()}
              />
            </div>
          </ListGroup.Item>
        </ListGroup>
      </div>
    </div>
  );
}
