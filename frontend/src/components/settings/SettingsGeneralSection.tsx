import {
  Contrast as ContrastIcon,
  Moon as MoonIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Sun as SunIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
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
            <div
              role="group"
              className="tw:flex tw:flex-wrap tw:gap-1"
              aria-label={m.time_format_label()}
            >
              <Button
                size="sm"
                variant={timeFormat === "24h" ? "default" : "outline"}
                aria-pressed={timeFormat === "24h"}
                onClick={() => onTimeFormatChange("24h")}
              >
                24h
              </Button>
              <Button
                size="sm"
                variant={timeFormat === "12h" ? "default" : "outline"}
                aria-pressed={timeFormat === "12h"}
                onClick={() => onTimeFormatChange("12h")}
              >
                12h
              </Button>
            </div>
          </div>
        </ListGroup.Item>
        <ListGroup.Item>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-medium">{m.theme_label()}</div>
              <small className="text-muted">{m.theme_description()}</small>
            </div>
            <div
              role="group"
              className="tw:flex tw:flex-wrap tw:gap-1"
              aria-label={m.theme_label()}
            >
              <Button
                size="sm"
                variant={theme === "auto" ? "default" : "outline"}
                aria-pressed={theme === "auto"}
                onClick={() => onThemeChange("auto")}
              >
                <Icon icon={ContrastIcon} className="tw:mr-1" />
                {m.theme_auto()}
              </Button>
              <Button
                size="sm"
                variant={theme === "light" ? "default" : "outline"}
                aria-pressed={theme === "light"}
                onClick={() => onThemeChange("light")}
              >
                <Icon icon={SunIcon} className="tw:mr-1" />
                {m.theme_light()}
              </Button>
              <Button
                size="sm"
                variant={theme === "dark" ? "default" : "outline"}
                aria-pressed={theme === "dark"}
                onClick={() => onThemeChange("dark")}
              >
                <Icon icon={MoonIcon} className="tw:mr-1" />
                {m.theme_dark()}
              </Button>
            </div>
          </div>
        </ListGroup.Item>
        <ListGroup.Item>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-medium">{m.language_label()}</div>
              <small className="text-muted">{m.language_description()}</small>
            </div>
            <div
              role="group"
              className="tw:flex tw:flex-wrap tw:gap-1"
              aria-label={m.language_label()}
            >
              <Button
                size="sm"
                variant={locale === "en" ? "default" : "outline"}
                aria-pressed={locale === "en"}
                onClick={() => onLocaleChange("en")}
              >
                EN
              </Button>
              <Button
                size="sm"
                variant={locale === "nl" ? "default" : "outline"}
                aria-pressed={locale === "nl"}
                onClick={() => onLocaleChange("nl")}
              >
                NL
              </Button>
            </div>
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
