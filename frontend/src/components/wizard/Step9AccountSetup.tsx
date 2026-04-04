import Button from "react-bootstrap/Button";
import type { RefObject } from "react";
import * as m from "../../paraglide/messages.js";

interface Step9AccountSetupProps {
  isAuthenticated: boolean;
  displayName: string | null;
  onConnectAccount: () => void;
  onSkip: () => void;
  onPrev: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step9AccountSetup({
  isAuthenticated,
  displayName,
  onConnectAccount,
  onSkip,
  onPrev,
  firstButtonRef,
}: Step9AccountSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-cloud-arrow-up display-4 text-primary"></i>
        <h4 className="mt-3">{m.wizard_account_heading()}</h4>
        <p className="text-muted">{m.wizard_account_subtitle()}</p>
      </div>

      {isAuthenticated ? (
        <div className="text-center py-3">
          <i className="bi bi-person-check-fill text-success display-6 mb-3 d-block"></i>
          <p className="fw-medium">
            {displayName ? m.auth_logged_in_as({ displayName }) : m.account_signed_in()}
          </p>
          <p className="text-muted small">{m.wizard_account_already_connected()}</p>
        </div>
      ) : (
        <div>
          <ul className="list-unstyled mb-4">
            <li className="d-flex align-items-start mb-3">
              <i className="bi bi-cloud-check text-success me-3 mt-1 flex-shrink-0 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.account_sync_benefit_backup()}</h6>
                <small className="text-muted">{m.wizard_account_benefit_backup_desc()}</small>
              </div>
            </li>
            <li className="d-flex align-items-start mb-3">
              <i className="bi bi-phone text-primary me-3 mt-1 flex-shrink-0 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.account_sync_benefit_crossdevice()}</h6>
                <small className="text-muted">{m.wizard_account_benefit_crossdevice_desc()}</small>
              </div>
            </li>
            <li className="d-flex align-items-start">
              <i className="bi bi-wifi-off text-info me-3 mt-1 flex-shrink-0 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_account_benefit_local_title()}</h6>
                <small className="text-muted">{m.wizard_account_benefit_local_desc()}</small>
              </div>
            </li>
          </ul>
        </div>
      )}

      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mt-4">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-3 order-sm-1"
        >
          <i className="bi bi-arrow-left me-1"></i> {m.back()}
        </Button>
        {!isAuthenticated && (
          <Button variant="outline-secondary" onClick={onSkip} className="order-2">
            {m.skip()}
          </Button>
        )}
        <Button
          variant={isAuthenticated ? "primary" : "outline-primary"}
          onClick={isAuthenticated ? onSkip : onConnectAccount}
          className="order-1 order-sm-3"
        >
          {isAuthenticated ? (
            <>
              {m.wizard_finish_setup()} <i className="bi bi-check-lg ms-1"></i>
            </>
          ) : (
            <>
              <i className="bi bi-person-plus me-1"></i>
              {m.account_connect_btn()}
            </>
          )}
        </Button>
      </div>
    </>
  );
}
