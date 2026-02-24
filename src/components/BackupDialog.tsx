import { useEffect, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { dayjs } from "../utils/dateTimeUtils";
import {
  checkBackupDataPresence,
  downloadAppBackup,
  type BackupDataPresence,
} from "../utils/appBackup";

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
    });
    onHide();
  };

  const nothingSelected =
    !includeUserState &&
    !includeTimeOff &&
    !includeWorkLocations &&
    !includeTasks &&
    !includeTemplatesAndLabels;

  const showYearFilter = (presence?.availableYears.length ?? 0) > 0;

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby={titleId}>
      <Modal.Header closeButton>
        <Modal.Title id={titleId}>
          <i className="bi bi-download me-2" aria-hidden="true"></i>
          Backup App Data
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {showYearFilter && presence && (
          <Form.Group className="mb-3">
            <Form.Label className="fw-medium">Year</Form.Label>
            <Form.Select
              size="sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="all">All years</option>
              {presence.availableYears.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-muted">
              Year filter applies to tasks and work location data.
            </Form.Text>
          </Form.Group>
        )}
        <p className="fw-medium mb-2">Include in backup:</p>
        <div className="d-flex flex-column gap-2">
          <Form.Check
            type="checkbox"
            id="backup-user-state"
            label="Settings & preferences"
            checked={includeUserState}
            onChange={(e) => setIncludeUserState(e.target.checked)}
          />
          {presence?.hasTimeOff && (
            <Form.Check
              type="checkbox"
              id="backup-time-off"
              label="Time off events (.hday)"
              checked={includeTimeOff}
              onChange={(e) => setIncludeTimeOff(e.target.checked)}
            />
          )}
          {presence?.hasWorkLocations && (
            <Form.Check
              type="checkbox"
              id="backup-work-locations"
              label="Work location data"
              checked={includeWorkLocations}
              onChange={(e) => setIncludeWorkLocations(e.target.checked)}
            />
          )}
          {presence?.hasTasks && (
            <Form.Check
              type="checkbox"
              id="backup-tasks"
              label="Time tracking tasks"
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
            />
          )}
          {(presence?.hasTemplates || presence?.hasLabels) && (
            <Form.Check
              type="checkbox"
              id="backup-templates-labels"
              label="Time tracking templates & labels"
              checked={includeTemplatesAndLabels}
              onChange={(e) => setIncludeTemplatesAndLabels(e.target.checked)}
            />
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleExport} disabled={nothingSelected}>
          <i className="bi bi-download me-1" aria-hidden="true"></i>
          Export Backup
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
