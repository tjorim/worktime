import {
  ArrowLeft as ArrowLeftIcon,
  Check as CheckIcon,
  CircleCheck as CircleCheckIcon,
  CircleX as CircleXIcon,
  Cloud as CloudIcon,
  HardDrive as HardDriveIcon,
  UserCheck as UserCheckIcon,
  UserPlus as UserPlusIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Badge from "react-bootstrap/Badge";
import type { RefObject } from "react";
import * as m from "@/paraglide/messages.js";

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
      <div className="text-center mb-3">
        <h4 className="mb-1">{m.wizard_account_heading()}</h4>
        <p className="text-muted small">{m.wizard_account_subtitle()}</p>
      </div>

      {isAuthenticated ? (
        <div className="text-center py-3">
          <Icon icon={UserCheckIcon} className="text-success display-6 mb-3 d-block" />
          <p className="fw-medium">
            {displayName ? m.auth_logged_in_as({ displayName }) : m.account_signed_in()}
          </p>
          <p className="text-muted small">{m.wizard_account_already_connected()}</p>
        </div>
      ) : (
        <div className="row g-3 mb-3">
          {/* Local Only card */}
          <div className="col-12 col-md-6">
            <Card className="h-100 border-secondary">
              <Card.Body className="p-3">
                <Card.Title className="fs-6 fw-semibold text-secondary mb-3">
                  <Icon icon={HardDriveIcon} className="me-2" />
                  {m.wizard_account_local_card_title()}
                </Card.Title>
                <ul className="list-unstyled small mb-3">
                  <li className="mb-2">
                    <Icon icon={CircleCheckIcon} className="text-success me-2" />
                    {m.wizard_account_local_pro_1()}
                  </li>
                  <li className="mb-2">
                    <Icon icon={CircleCheckIcon} className="text-success me-2" />
                    {m.wizard_account_local_pro_2()}
                  </li>
                  <li className="mb-2 text-muted">
                    <Icon icon={CircleXIcon} className="text-danger me-2" />
                    {m.wizard_account_local_con_1()}
                  </li>
                  <li className="text-muted">
                    <Icon icon={CircleXIcon} className="text-danger me-2" />
                    {m.wizard_account_local_con_2()}
                  </li>
                </ul>
                <Button variant="outline-secondary" size="sm" className="w-100" onClick={onSkip}>
                  {m.skip()}
                </Button>
              </Card.Body>
            </Card>
          </div>

          {/* With Account card */}
          <div className="col-12 col-md-6">
            <Card className="h-100 border-primary">
              <Card.Body className="p-3">
                <Card.Title className="fs-6 fw-semibold text-primary mb-3">
                  <Icon icon={CloudIcon} className="me-2" />
                  {m.wizard_account_connected_card_title()}
                  <Badge bg="primary" className="ms-2 fw-normal" style={{ fontSize: "0.65em" }}>
                    {m.wizard_account_recommended()}
                  </Badge>
                </Card.Title>
                <ul className="list-unstyled small mb-3">
                  <li className="mb-2">
                    <Icon icon={CircleCheckIcon} className="text-success me-2" />
                    {m.wizard_account_connected_pro_1()}
                  </li>
                  <li className="mb-2">
                    <Icon icon={CircleCheckIcon} className="text-success me-2" />
                    {m.wizard_account_connected_pro_2()}
                  </li>
                  <li className="mb-2">
                    <Icon icon={CircleCheckIcon} className="text-success me-2" />
                    {m.wizard_account_connected_pro_3()}
                  </li>
                </ul>
                <Button variant="primary" size="sm" className="w-100" onClick={onConnectAccount}>
                  <Icon icon={UserPlusIcon} className="me-1" />
                  {m.account_connect_btn()}
                </Button>
              </Card.Body>
            </Card>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between mt-2">
        <Button variant="outline-secondary" size="sm" onClick={onPrev} ref={firstButtonRef}>
          <Icon icon={ArrowLeftIcon} className="me-1" /> {m.back()}
        </Button>
        {isAuthenticated && (
          <Button variant="primary" onClick={onSkip}>
            {m.wizard_finish_setup()} <Icon icon={CheckIcon} className="ms-1" />
          </Button>
        )}
      </div>
    </>
  );
}
