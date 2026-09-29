import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import * as m from "@/paraglide/messages.js";

type LabelForm = {
  name: string;
  color: string;
};

type LabelModalProps = {
  show: boolean;
  title: string;
  submitLabel: string;
  value: LabelForm;
  onChange: (value: LabelForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function LabelModal({
  show,
  title,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit,
}: LabelModalProps) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="modal-body">
          <Form
            id="labelForm"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <Form.Group controlId="labelName" className="mb-3">
              <Form.Label>{m.form_label_name()}</Form.Label>
              <Form.Control
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                placeholder={m.form_label_name_placeholder()}
                aria-required="true"
                required
              />
            </Form.Group>
            <Form.Group controlId="labelColor">
              <Form.Label>{m.form_label_color()}</Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <OverlayTrigger
                  placement="top"
                  overlay={<Tooltip id="label-color-picker">{m.tt_select_label_color()}</Tooltip>}
                >
                  <Form.Control
                    type="color"
                    value={value.color}
                    onChange={(event) => onChange({ ...value, color: event.target.value })}
                    className="form-control-color"
                    aria-required="true"
                    required
                  />
                </OverlayTrigger>
                <Form.Control
                  value={value.color}
                  onChange={(event) => onChange({ ...value, color: event.target.value })}
                  placeholder="#3B82F6"
                  aria-label={m.form_label_color_hex_aria()}
                  aria-required="true"
                  required
                />
              </div>
            </Form.Group>
          </Form>
        </div>
        <DialogFooter>
          <Button variant="outline-secondary" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button type="submit" form="labelForm" variant="primary">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
