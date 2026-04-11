import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import * as m from "@/paraglide/messages.js";

interface KeyboardShortcutsModalProps {
  show: boolean;
  onHide: () => void;
  enableTimeOff?: boolean;
  enableTimeTracking?: boolean;
  enableGantt?: boolean;
}

/**
 * Modal displaying available keyboard shortcuts organized by category.
 */
export function KeyboardShortcutsModal({
  show,
  onHide,
  enableTimeOff = false,
  enableTimeTracking = false,
  enableGantt = false,
}: KeyboardShortcutsModalProps) {
  const navigationItems = [
    { keys: ["C"], description: m.shortcuts_calendar_tab() },
    { keys: ["S"], description: m.shortcuts_schedule_tab() },
    ...(enableTimeOff ? [{ keys: ["O"], description: m.shortcuts_timeoff_tab() }] : []),
    ...(enableTimeTracking ? [{ keys: ["T"], description: m.shortcuts_timetracking_tab() }] : []),
    ...(enableGantt ? [{ keys: ["G"], description: m.shortcuts_gantt_tab() }] : []),
    { keys: ["←", "→"], description: m.shortcuts_prev_next_date() },
    { keys: ["Ctrl", ","], description: m.shortcuts_open_settings() },
  ];

  const categories = [{ category: m.shortcuts_nav_category(), items: navigationItems }];

  if (enableTimeOff) {
    categories.push({
      category: m.shortcuts_timeoff_category(),
      items: [
        { keys: ["Ctrl", "I"], description: m.shortcuts_import_hday() },
        { keys: ["Ctrl", "S"], description: m.shortcuts_export_hday() },
        { keys: ["Delete"], description: m.shortcuts_delete_events() },
        { keys: ["Escape"], description: m.shortcuts_cancel_edit() },
      ],
    });
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-keyboard me-2"></i>
          {m.keyboard_shortcuts_label()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {categories.map(({ category, items }) => (
          <div key={category} className="mb-3">
            <h6 className="text-muted mb-2">{category}</h6>
            <div className="row g-2">
              {items.map(({ keys, description }) => (
                <div
                  key={description}
                  className="col-12 d-flex justify-content-between align-items-center"
                >
                  <span className="text-muted small">{description}</span>
                  <span>
                    {keys.map((key, i) => (
                      <span key={key}>
                        {i > 0 && <span className="text-muted mx-1">+</span>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
