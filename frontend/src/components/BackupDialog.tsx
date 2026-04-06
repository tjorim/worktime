import { useEffect, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  checkBackupDataPresence,
  downloadAppBackup,
  type BackupDataPresence,
} from "@/utils/appBackup";
import * as m from "@/paraglide/messages.js";

interface BackupDialogProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Modal for exporting a selective backup of app data.
 *
 * Shows a year selector (when year-scoped data exists) and checkboxes for each
 * data category that has content. All present categories are pre-selected when
 * the dialog opens.
 */
export function BackupDialog({ show, onHide }: BackupDialogProps) {
  const titleId = useId();

  const [presence, setPresence] = useState<BackupDataPresence | null>(null);
  const [selectedYear, setSelectedYear] = useState("all");
  const [includeUserState, setIncludeUserState] = useState(true);
  const [includeTimeOff, setIncludeTimeOff] = useState(false);
  const [includeWorkLocations, setIncludeWorkLocations] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [includeTemplatesAndLabels, setIncludeTemplatesAndLabels] = useState(false);
  const [includeGanttTasks, setIncludeGanttTasks] = useState(false);

  // Refresh presence and reset selections each time the dialog opens
  useEffect(() => {
    if (show) {
      const p = checkBackupDataPresence();
      setPresence(p);
      setSelectedYear("all");
      setIncludeUserState(p.hasUserState);
      setIncludeTimeOff(p.hasTimeOff);
      setIncludeWorkLocations(p.hasWorkLocations);
      setIncludeTasks(p.hasTasks);
      setIncludeTemplatesAndLabels(p.hasTemplates || p.hasLabels);
      setIncludeGanttTasks(p.hasGanttTasks);
    }
  }, [show]);

  const handleExport = () => {
    const year = selectedYear === "all" ? undefined : parseInt(selectedYear, 10);
    downloadAppBackup(dayjs().format("YYYY-MM-DD"), {
      year,
      includeUserState,
      includeTimeOff,
      includeWorkLocations,
      includeTasks,
      includeTemplates: includeTemplatesAndLabels,
      includeLabels: includeTemplatesAndLabels,
      includeGanttTasks,
    });
    onHide();
  };

  const nothingSelected =
    !includeUserState &&
    !includeTimeOff &&
    !includeWorkLocations &&
    !includeTasks &&
    !includeTemplatesAndLabels &&
    !includeGanttTasks;

  const showYearFilter = (presence?.availableYears.length ?? 0) > 0;

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby={titleId}>
      <Modal.Header closeButton>
        <Modal.Title id={titleId}>
          <i className="bi bi-download me-2" aria-hidden="true"></i>
          {m.backup_app_data_label()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {showYearFilter && presence && (
          <Form.Group className="mb-3" controlId="yearSelect">
            <Form.Label className="fw-medium">{m.backup_year_label()}</Form.Label>
            <Form.Select
              size="sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              aria-describedby="yearHelp"
            >
              <option value="all">{m.backup_all_years()}</option>
              {presence.availableYears.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </Form.Select>
            <Form.Text id="yearHelp" className="text-muted">
              {m.backup_year_filter_help()}
            </Form.Text>
          </Form.Group>
        )}
        <p className="fw-medium mb-2">{m.backup_include_label()}</p>
        <div className="d-flex flex-column gap-2">
          <Form.Check
            type="checkbox"
            id="backup-user-state"
            label={m.backup_include_settings()}
            checked={includeUserState}
            onChange={(e) => setIncludeUserState(e.target.checked)}
          />
          {presence?.hasTimeOff && (
            <Form.Check
              type="checkbox"
              id="backup-time-off"
              label={m.backup_include_time_off()}
              checked={includeTimeOff}
              onChange={(e) => setIncludeTimeOff(e.target.checked)}
            />
          )}
          {presence?.hasWorkLocations && (
            <Form.Check
              type="checkbox"
              id="backup-work-locations"
              label={m.backup_include_work_locations()}
              checked={includeWorkLocations}
              onChange={(e) => setIncludeWorkLocations(e.target.checked)}
            />
          )}
          {presence?.hasTasks && (
            <Form.Check
              type="checkbox"
              id="backup-tasks"
              label={m.backup_include_tasks()}
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
            />
          )}
          {(presence?.hasTemplates || presence?.hasLabels) && (
            <Form.Check
              type="checkbox"
              id="backup-templates-labels"
              label={m.backup_include_templates()}
              checked={includeTemplatesAndLabels}
              onChange={(e) => setIncludeTemplatesAndLabels(e.target.checked)}
            />
          )}
          {presence?.hasGanttTasks && (
            <Form.Check
              type="checkbox"
              id="backup-gantt-tasks"
              label={m.backup_include_gantt()}
              checked={includeGanttTasks}
              onChange={(e) => setIncludeGanttTasks(e.target.checked)}
            />
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          {m.cancel()}
        </Button>
        <Button variant="primary" onClick={handleExport} disabled={nothingSelected}>
          <i className="bi bi-download me-1" aria-hidden="true"></i>
          {m.backup_export_btn()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
