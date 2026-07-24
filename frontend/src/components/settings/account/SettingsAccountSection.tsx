import { useState } from "react";
import { Link } from "@tanstack/react-router";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import * as m from "@/paraglide/messages.js";

interface SettingsAccountSectionProps {
  isValidating: boolean;
  isAuthenticated: boolean;
  resolvedDisplayName: string | null;
  username: string | null;
  accountId: number | null;
  userId: string | null;
  isAdmin: boolean;
  profileError: string | null;
  isProfileLoading: boolean;
  profileDraft: string;
  isProfileSaving: boolean;
  hasProfileChanges: boolean;
  isDeletingAccount: boolean;
  deleteAccountError: string | null;
  onProfileDraftChange: (value: string) => void;
  onSaveProfile: () => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
  onSignup: () => void;
  onLogin: () => void;
}

export function SettingsAccountSection({
  isValidating,
  isAuthenticated,
  resolvedDisplayName,
  username,
  accountId,
  userId,
  isAdmin,
  profileError,
  isProfileLoading,
  profileDraft,
  isProfileSaving,
  hasProfileChanges,
  isDeletingAccount,
  deleteAccountError,
  onProfileDraftChange,
  onSaveProfile,
  onDeleteAccount,
  onLogout,
  onSignup,
  onLogin,
}: SettingsAccountSectionProps) {
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  return (
    <div className="border-bottom">
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-person-circle me-2"></i>
          {m.account_section_title()}
        </h6>
        <ListGroup variant="flush">
          {isValidating ? (
            <ListGroup.Item>
              <div className="d-flex align-items-center gap-2 text-muted small">
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>{m.loading()}</span>
              </div>
            </ListGroup.Item>
          ) : isAuthenticated ? (
            <ListGroup.Item>
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <div className="fw-medium">
                      <i className="bi bi-person-check me-2 text-success"></i>
                      {resolvedDisplayName
                        ? m.auth_logged_in_as({ displayName: resolvedDisplayName })
                        : m.account_signed_in()}
                    </div>
                    {username ? <small className="text-muted">@{username}</small> : null}
                  </div>
                  <Button variant="outline-secondary" size="sm" onClick={onLogout}>
                    <i className="bi bi-box-arrow-right me-1"></i>
                    {m.auth_logout()}
                  </Button>
                </div>

                {profileError ? (
                  <Alert variant="warning" className="mb-0 py-2">
                    {profileError}
                  </Alert>
                ) : null}

                <Alert variant="info" className="mb-0 py-2">
                  <div className="small">
                    {m.account_privacy_notice_body()}{" "}
                    <Link to="/privacy" className="alert-link">
                      {m.account_privacy_notice_link()}
                    </Link>
                  </div>
                </Alert>

                {isProfileLoading && accountId === null ? (
                  <div className="d-flex align-items-center gap-2 text-muted small">
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>{m.loading()}</span>
                  </div>
                ) : (
                  <>
                    <Form.Group controlId="account-display-name">
                      <Form.Label className="fw-medium mb-1">
                        {m.account_profile_display_name_label()}
                      </Form.Label>
                      <Form.Control
                        size="sm"
                        type="text"
                        value={profileDraft}
                        onChange={(event) => onProfileDraftChange(event.target.value)}
                        placeholder={m.account_profile_display_name_placeholder()}
                        disabled={accountId === null || isProfileSaving}
                      />
                      <Form.Text className="text-muted">
                        {m.account_profile_display_name_description()}
                      </Form.Text>
                    </Form.Group>

                    <div className="small text-muted d-flex flex-column gap-1">
                      <div>
                        <span className="fw-medium">{m.account_profile_username_label()}:</span> {username ?? "—"}
                      </div>
                      <div>
                        <span className="fw-medium">{m.account_profile_user_id_label()}:</span>{" "}
                        {accountId ?? userId ?? "—"}
                      </div>
                      <div>
                        <span className="fw-medium">{m.account_profile_role_label()}:</span>{" "}
                        {isAdmin ? m.account_profile_role_admin() : m.account_profile_role_member()}
                      </div>
                    </div>

                    <div className="d-flex gap-2 flex-wrap">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onSaveProfile}
                        disabled={!hasProfileChanges || isProfileSaving || accountId === null}
                      >
                        <i className="bi bi-floppy me-1"></i>
                        {isProfileSaving ? m.account_profile_saving_btn() : m.account_profile_save_btn()}
                      </Button>
                    </div>

                    <div className="pt-2 border-top">
                      <h6 className="mb-2 text-danger">{m.account_delete_section_title()}</h6>
                      <p className="text-muted small mb-2">{m.account_delete_description()}</p>
                      {deleteAccountError ? (
                        <Alert variant="danger" className="mb-2 py-2">
                          {deleteAccountError}
                        </Alert>
                      ) : null}
                      <Button
                        variant="outline-danger"
                        size="sm"
                        disabled={isDeletingAccount}
                        onClick={() => setShowDeleteAccountConfirm(true)}
                      >
                        <i className="bi bi-trash me-1"></i>
                        {isDeletingAccount ? m.account_delete_busy() : m.account_delete_btn()}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ListGroup.Item>
          ) : (
            <ListGroup.Item>
              <div className="mb-2">
                <div className="fw-medium mb-1">
                  <i className="bi bi-person-x me-2 text-muted"></i>
                  {m.account_not_signed_in()}
                </div>
                <small className="text-muted d-block mb-2">{m.account_sync_benefits()}</small>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <small className="text-muted">
                    <i className="bi bi-cloud-check text-success me-1"></i>
                    {m.account_sync_benefit_backup()}
                  </small>
                  <small className="text-muted">
                    <i className="bi bi-phone text-success me-1"></i>
                    {m.account_sync_benefit_crossdevice()}
                  </small>
                </div>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <Button variant="primary" size="sm" onClick={onSignup}>
                  <i className="bi bi-person-plus me-1"></i>
                  {m.account_connect_btn()}
                </Button>
                <Button variant="outline-primary" size="sm" onClick={onLogin}>
                  <i className="bi bi-box-arrow-in-right me-1"></i>
                  {m.account_sign_in_btn()}
                </Button>
              </div>
            </ListGroup.Item>
          )}
        </ListGroup>
      </div>
      <ConfirmationDialog
        isOpen={showDeleteAccountConfirm}
        title={m.account_delete_confirm_title()}
        message={m.account_delete_confirm_message()}
        confirmLabel={m.delete()}
        cancelLabel={m.cancel()}
        onConfirm={() => {
          setShowDeleteAccountConfirm(false);
          onDeleteAccount();
        }}
        onCancel={() => setShowDeleteAccountConfirm(false)}
        variant="danger"
        icon="bi-trash"
      />
    </div>
  );
}
