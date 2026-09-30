import {
  Contrast as ContrastIcon,
  Moon as MoonIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Sun as SunIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";

interface SettingsGeneralSectionProps {
  timeFormat: "12h" | "24h";
  theme: "light" | "dark" | "auto";
  locale: "en" | "nl";
  notificationsEnabled: boolean;
  onTimeFormatChange: (format: "12h" | "24h") => void;
  onThemeChange: (theme: "light" | "dark" | "auto") => void;
  onLocaleChange: (locale: "en" | "nl") => void;
  onNotificationsChange: (enabled: boolean) => void;
}

export function SettingsGeneralSection({
  timeFormat,
  theme,
  locale,
  notificationsEnabled,
  onTimeFormatChange,
  onThemeChange,
  onLocaleChange,
  onNotificationsChange,
}: SettingsGeneralSectionProps) {
  return (
    <div className="p-3">
      <h6 className="text-muted mb-3">
        <Icon icon={SlidersHorizontalIcon} className="me-2" />
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
                <Icon icon={ContrastIcon} className="me-1" />
                {m.theme_auto()}
              </Button>
              <Button
                variant={theme === "light" ? "primary" : "outline-secondary"}
                aria-pressed={theme === "light"}
                onClick={() => onThemeChange("light")}
              >
                <Icon icon={SunIcon} className="me-1" />
                {m.theme_light()}
              </Button>
              <Button
                variant={theme === "dark" ? "primary" : "outline-secondary"}
                aria-pressed={theme === "dark"}
                onClick={() => onThemeChange("dark")}
              >
                <Icon icon={MoonIcon} className="me-1" />
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
  );
}
