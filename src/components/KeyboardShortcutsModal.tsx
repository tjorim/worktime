import { useMemo } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";

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
  const shortcuts = useMemo(() => {
    const navigationItems = [
      { keys: ["C"], description: "Calendar tab" },
      { keys: ["S"], description: "Schedule tab" },
      ...(enableTimeOff ? [{ keys: ["O"], description: "Time Off tab" }] : []),
      ...(enableTimeTracking ? [{ keys: ["T"], description: "Time Tracking tab" }] : []),
      ...(enableGantt ? [{ keys: ["G"], description: "Gantt tab" }] : []),
      { keys: ["←", "→"], description: "Previous / next date" },
      { keys: ["Ctrl", ","], description: "Open settings" },
    ];

    const categories = [{ category: "Navigation", items: navigationItems }];

    if (enableTimeOff) {
      categories.push({
        category: "Time Off",
        items: [
          { keys: ["Ctrl", "I"], description: "Import .hday file" },
          { keys: ["Ctrl", "S"], description: "Export .hday file" },
          { keys: ["Delete"], description: "Delete selected events" },
          { keys: ["Escape"], description: "Cancel edit" },
          { keys: ["Ctrl", "Z"], description: "Undo" },
          { keys: ["Ctrl", "Y"], description: "Redo" },
        ],
      });
    }

    return categories;
  }, [enableTimeOff, enableTimeTracking, enableGantt]);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-keyboard me-2"></i>
          Keyboard Shortcuts
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {shortcuts.map(({ category, items }) => (
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
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
