import { useState } from "react";
import Accordion from "react-bootstrap/Accordion";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Modal from "react-bootstrap/Modal";
import clsx from "clsx";
import { type ChangelogVersion, changelogData, futurePlans } from "@/data/changelog";
import * as m from "@/paraglide/messages.js";

interface ChangelogModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Render a modal displaying the application's changelog, per-version details and upcoming plans.
 *
 * @param show - Whether the modal is visible
 * @param onHide - Callback invoked to request closing the modal
 * @returns The Modal JSX element containing the changelog, versioned entries and "Coming Soon" plans
 */
export function ChangelogModal({ show, onHide }: ChangelogModalProps) {
  const [activeKey, setActiveKey] = useState<string>("0");

  const getStatusBadge = (status: ChangelogVersion["status"]) => {
    switch (status) {
      case "current":
        return <Badge bg="primary">{m.changelog_status_current()}</Badge>;
      case "planned":
        return <Badge bg="secondary">{m.changelog_status_planned()}</Badge>;
      case "released":
        return <Badge bg="success">{m.changelog_status_released()}</Badge>;
      default:
        return null;
    }
  };

  const getIconForSection = (title: string): string => {
    switch (title) {
      case "added":
        return "bi-plus-circle";
      case "changed":
        return "bi-arrow-repeat";
      case "fixed":
        return "bi-bug";
      case "planned":
        return "bi-calendar-event";
      default:
        return "bi-info-circle";
    }
  };

  const renderChangeSection = (
    key: "added" | "changed" | "fixed" | "planned",
    label: string,
    items: string[],
    textClass: string,
  ) => {
    if (items.length === 0) return null;
    const seen = new Map<string, number>();

    return (
      <div className="mb-3">
        <h6 className={clsx(textClass, "mb-2")}>
          <i className={clsx("bi", getIconForSection(key), "me-2")}></i>
          {label}
        </h6>
        <ul className="list-unstyled">
          {items.map((item) => {
            const occurrence = (seen.get(item) ?? 0) + 1;
            seen.set(item, occurrence);
            return (
              <li key={`${key}-${item}-${occurrence}`} className="mb-1">
                <small className="text-muted">•</small> {item}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className={clsx("bi", "bi-journal-text", "me-2")}></i>
          {m.changelog_modal_title()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-3">
          <p className="text-muted">{m.changelog_modal_description()}</p>
        </div>

        <Accordion
          activeKey={activeKey}
          onSelect={(key) => {
            if (Array.isArray(key)) {
              setActiveKey(key[0] ?? "");
              return;
            }
            setActiveKey(key ?? "");
          }}
        >
          {changelogData.map((version, index) => (
            <Accordion.Item eventKey={index.toString()} key={version.version}>
              <Accordion.Header>
                <div className="d-flex justify-content-between align-items-center w-100 me-2">
                  <div>
                    <strong>{m.changelog_version_label({ version: version.version })}</strong>
                    <small className="text-muted ms-2">{version.date}</small>
                  </div>
                  {getStatusBadge(version.status)}
                </div>
              </Accordion.Header>
              <Accordion.Body>
                {renderChangeSection(
                  "added",
                  m.changelog_section_added(),
                  version.added,
                  "text-success",
                )}
                {renderChangeSection(
                  "changed",
                  m.changelog_section_changed(),
                  version.changed,
                  "text-info",
                )}
                {renderChangeSection(
                  "fixed",
                  m.changelog_section_fixed(),
                  version.fixed,
                  "text-warning",
                )}
                {version.planned &&
                  renderChangeSection(
                    "planned",
                    m.changelog_section_planned(),
                    version.planned,
                    "text-secondary",
                  )}

                {version.technicalDetails && (
                  <Card className="mt-3 border-0 bg-body-secondary">
                    <Card.Body className="py-2">
                      <small className="text-muted">
                        <i className={clsx("bi", "bi-info-circle", "me-1")}></i>
                        <strong>{version.technicalDetails.title}:</strong>{" "}
                        {version.technicalDetails.description}
                      </small>
                    </Card.Body>
                  </Card>
                )}
              </Accordion.Body>
            </Accordion.Item>
          ))}
        </Accordion>

        <div className="mt-4 p-3 bg-body-secondary rounded">
          <h6 className="text-primary mb-2">
            <i className={clsx("bi", "bi-rocket", "me-2")}></i>
            {m.changelog_coming_soon_heading()}
          </h6>
          {Object.entries(futurePlans).map(([version, plan], index, array) => (
            <p
              key={version}
              className={
                index === array.length - 1 ? "mb-0 small text-muted" : "mb-1 small text-muted"
              }
            >
              <strong>{version}:</strong> {plan.features.join(", ")}
            </p>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <small className="text-muted me-auto">
          {m.changelog_semver_text()}{" "}
          <a href="https://semver.org/" target="_blank" rel="noopener noreferrer">
            {m.changelog_semver_link()}
          </a>
        </small>
        <Button variant="secondary" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
