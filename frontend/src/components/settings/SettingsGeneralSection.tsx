import ButtonGroup from "react-bootstrap/ButtonGroup";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import type { NotificationLeadTimeMinutes } from "@/contexts/SettingsContext";
import * as m from "@/paraglide/messages.js";

const LEAD_TIME_OPTIONS: readonly NotificationLeadTimeMinutes[] = [15, 60, 120];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

interface SettingsGeneralSectionProps {
  timeFormat: "12h" | "24h";
  theme: "light" | "dark" | "auto";
  locale: "en" | "nl";
  notificationsEnabled: boolean;
  notificationLeadTimeMinutes: NotificationLeadTimeMinutes;
  notificationQuietHoursStart: number | null;
  notificationQuietHoursEnd: number | null;
  onTimeFormatChange: (format: "12h" | "24h") => void;
  onThemeChange: (theme: "light" | "dark" | "auto") => void;
  onLocaleChange: (locale: "en" | "nl") => void;
  onNotificationsChange: (enabled: boolean) => void;
  onNotificationLeadTimeChange: (minutes: NotificationLeadTimeMinutes) => void;
  onNotificationQuietHoursChange: (range: { start: number; end: number } | null) => void;
}

export function SettingsGeneralSection({
  timeFormat,
  theme,
  locale,
  notificationsEnabled,
  notificationLeadTimeMinutes,
  notificationQuietHoursStart,
  notificationQuietHoursEnd,
  onTimeFormatChange,
  onThemeChange,
  onLocaleChange,
  onNotificationsChange,
  onNotificationLeadTimeChange,
  onNotificationQuietHoursChange,
}: SettingsGeneralSectionProps) {
  const quietHoursEnabled =
    notificationQuietHoursStart != null && notificationQuietHoursEnd != null;
  const leadTimeLabel = (minutes: NotificationLeadTimeMinutes) =>
    minutes === 15
      ? m.notification_lead_time_15m()
      : minutes === 60
        ? m.notification_lead_time_1h()
        : m.notification_lead_time_2h();
  return (
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
          <div className="d-flex flex-column gap-2">
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
            {notificationsEnabled && (
              <>
                <div className="d-flex justify-content-between align-items-center">
                  <small className="text-muted">{m.notification_lead_time_label()}</small>
                  <ButtonGroup size="sm" aria-label={m.notification_lead_time_label()}>
                    {LEAD_TIME_OPTIONS.map((minutes) => (
                      <Button
                        key={minutes}
                        variant={
                          notificationLeadTimeMinutes === minutes ? "primary" : "outline-secondary"
                        }
                        aria-pressed={notificationLeadTimeMinutes === minutes}
                        onClick={() => onNotificationLeadTimeChange(minutes)}
                      >
                        {leadTimeLabel(minutes)}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <small className="text-muted d-block">
                      {m.notification_quiet_hours_label()}
                    </small>
                    <small className="text-muted">{m.notification_quiet_hours_description()}</small>
                  </div>
                  <Form.Check
                    type="switch"
                    id="toggle-notification-quiet-hours"
                    checked={quietHoursEnabled}
                    onChange={(event) =>
                      onNotificationQuietHoursChange(
                        event.target.checked ? { start: 22, end: 6 } : null,
                      )
                    }
                    aria-label={m.notification_quiet_hours_label()}
                  />
                </div>
                {quietHoursEnabled && (
                  <div className="d-flex align-items-center gap-2">
                    <Form.Select
                      size="sm"
                      value={notificationQuietHoursStart ?? 22}
                      aria-label={m.notification_quiet_hours_start_aria()}
                      onChange={(event) =>
                        onNotificationQuietHoursChange({
                          start: Number(event.target.value),
                          end: notificationQuietHoursEnd ?? 6,
                        })
                      }
                    >
                      {HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </Form.Select>
                    <span className="text-muted small">{m.notification_quiet_hours_to()}</span>
                    <Form.Select
                      size="sm"
                      value={notificationQuietHoursEnd ?? 6}
                      aria-label={m.notification_quiet_hours_end_aria()}
                      onChange={(event) =>
                        onNotificationQuietHoursChange({
                          start: notificationQuietHoursStart ?? 22,
                          end: Number(event.target.value),
                        })
                      }
                    >
                      {HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                )}
              </>
            )}
          </div>
        </ListGroup.Item>
      </ListGroup>
    </div>
  );
}
