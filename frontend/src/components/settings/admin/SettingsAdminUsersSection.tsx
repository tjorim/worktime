import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import Table from "react-bootstrap/Table";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const locale = getLocale() === "nl" ? "nl-NL" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

interface SettingsAdminUsersSectionProps {
  currentAccountId: number | null;
  adminUsers: Array<{
    id: number;
    username: string;
    display_name: string;
    created_at: string;
    updated_at: string;
  }>;
  isAdminUsersLoading: boolean;
  adminUsersError: string | null;
  adminUsersDeleteError: string | null;
  deletingAdminUserId: number | null;
  onDeleteAdminUser: (userId: number) => void;
}

export function SettingsAdminUsersSection({
  currentAccountId,
  adminUsers,
  isAdminUsersLoading,
  adminUsersError,
  adminUsersDeleteError,
  deletingAdminUserId,
  onDeleteAdminUser,
}: SettingsAdminUsersSectionProps) {
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<number | null>(null);
  const pendingDeleteUser = adminUsers.find((user) => user.id === pendingDeleteUserId) ?? null;

  return (
    <div className="border-bottom">
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-people me-2"></i>
          {m.account_admin_users_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item>
            <p className="text-muted small mb-2">{m.account_admin_users_description()}</p>
            {isAdminUsersLoading ? (
              <div className="d-flex align-items-center gap-2 text-muted small">
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>{m.account_admin_users_loading()}</span>
              </div>
            ) : adminUsersError ? (
              <Alert variant="warning" className="mb-0 py-2">
                {adminUsersError}
              </Alert>
            ) : (
              <>
                {adminUsersDeleteError ? (
                  <Alert variant="danger" className="mb-2 py-2">
                    {adminUsersDeleteError}
                  </Alert>
                ) : null}
                {adminUsers.length === 0 ? (
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
                          <th className="text-end">{m.account_admin_users_actions()}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((user) => (
                          <tr key={user.id}>
                            <td>{user.id}</td>
                            <td>{user.username}</td>
                            <td>{user.display_name}</td>
                            <td>{formatTimestamp(user.created_at)}</td>
                            <td>{formatTimestamp(user.updated_at)}</td>
                            <td className="text-end">
                              <Button
                                variant="outline-danger"
                                size="sm"
                                disabled={currentAccountId === user.id || deletingAdminUserId !== null}
                                title={
                                  currentAccountId === user.id
                                    ? m.account_admin_users_delete_self_blocked()
                                    : undefined
                                }
                                onClick={() => setPendingDeleteUserId(user.id)}
                              >
                                {deletingAdminUserId === user.id
                                  ? m.account_admin_users_delete_busy()
                                  : m.delete()}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </ListGroup.Item>
        </ListGroup>
      </div>
      <ConfirmationDialog
        isOpen={pendingDeleteUser !== null}
        title={m.account_admin_users_delete_confirm_title()}
        message={
          pendingDeleteUser
            ? m.account_admin_users_delete_confirm_message({
                name: pendingDeleteUser.display_name || pendingDeleteUser.username,
                username: pendingDeleteUser.username,
              })
            : ""
        }
        confirmLabel={m.delete()}
        cancelLabel={m.cancel()}
        onConfirm={() => {
          if (!pendingDeleteUser) {
            return;
          }
          onDeleteAdminUser(pendingDeleteUser.id);
          setPendingDeleteUserId(null);
        }}
        onCancel={() => setPendingDeleteUserId(null)}
        variant="danger"
        icon="bi-trash"
      />
    </div>
  );
}
