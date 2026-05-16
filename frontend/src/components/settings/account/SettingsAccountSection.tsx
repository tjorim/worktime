import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Table from "react-bootstrap/Table";
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
  adminUsers: Array<{
    id: number;
    username: string;
    display_name: string;
    created_at: string;
    updated_at: string;
  }>;
  isAdminUsersLoading: boolean;
  adminUsersError: string | null;
  onProfileDraftChange: (value: string) => void;
  onSaveProfile: () => void;
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
  adminUsers,
  isAdminUsersLoading,
  adminUsersError,
  onProfileDraftChange,
  onSaveProfile,
  onLogout,
  onSignup,
  onLogin,
}: SettingsAccountSectionProps) {
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

                    {isAdmin ? (
                      <div className="pt-2 border-top">
                        <h6 className="mb-2">{m.account_admin_users_title()}</h6>
                        <p className="text-muted small mb-2">{m.account_admin_users_description()}</p>
                        {isAdminUsersLoading ? (
                          <div className="d-flex align-items-center gap-2 text-muted small">
                            <span
                              className="spinner-border spinner-border-sm"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            <span>{m.account_admin_users_loading()}</span>
                          </div>
                        ) : adminUsersError ? (
                          <Alert variant="warning" className="mb-0 py-2">
                            {adminUsersError}
                          </Alert>
                        ) : adminUsers.length === 0 ? (
                          <p className="text-muted small mb-0">{m.account_admin_users_empty()}</p>
                        ) : (
                          <div className="table-responsive">
                            <Table size="sm" striped hover className="mb-0 align-middle">
                              <thead>
                                <tr>
                                  <th>{m.account_admin_users_user_id()}</th>
                                  <th>{m.account_admin_users_username()}</th>
                                  <th>{m.account_admin_users_display_name()}</th>
                                  <th>{m.account_admin_users_created_at()}</th>
                                  <th>{m.account_admin_users_updated_at()}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adminUsers.map((user) => (
                                  <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td>{user.display_name}</td>
                                    <td>{user.created_at}</td>
                                    <td>{user.updated_at}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        )}
                      </div>
                    ) : null}
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
    </div>
  );
}
