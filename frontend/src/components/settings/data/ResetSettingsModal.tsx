import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import * as m from "@/paraglide/messages.js";

interface ResetSettingsModalProps {
  show: boolean;
  clearTimeTrackingData: boolean;
  clearTimeOffData: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChangeClearTimeTrackingData: (checked: boolean) => void;
  onChangeClearTimeOffData: (checked: boolean) => void;
}

export function ResetSettingsModal({
  show,
  clearTimeTrackingData,
  clearTimeOffData,
  onClose,
  onConfirm,
  onChangeClearTimeTrackingData,
  onChangeClearTimeOffData,
}: ResetSettingsModalProps) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{m.reset_settings_modal_title()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">{m.reset_settings_modal_body()}</p>
        <Form>
          <Form.Check
            id="reset-clear-time-tracking"
            type="checkbox"
            label={m.reset_also_clear_time_tracking()}
            checked={clearTimeTrackingData}
            onChange={(event) => onChangeClearTimeTrackingData(event.target.checked)}
          />
          <Form.Check
            id="reset-clear-time-off"
            type="checkbox"
            className="mt-2"
            label={m.reset_also_clear_time_off()}
            checked={clearTimeOffData}
            onChange={(event) => onChangeClearTimeOffData(event.target.checked)}
          />
        </Form>
        {(clearTimeTrackingData || clearTimeOffData) && (
          <Alert variant="warning" className="mt-3 mb-0">
            <div className="fw-semibold mb-1">{m.reset_warning()}</div>
            {clearTimeTrackingData && <div>{m.reset_warning_time_tracking()}</div>}
            {clearTimeOffData && <div>{m.reset_warning_time_off()}</div>}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {m.cancel()}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {m.reset_now()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
