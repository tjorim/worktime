import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import ListGroup from "react-bootstrap/ListGroup";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { AdminUsersTable } from "./AdminUsersTable";
import * as m from "@/paraglide/messages.js";

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
                  <AdminUsersTable
                    users={adminUsers}
                    currentAccountId={currentAccountId}
                    deletingAdminUserId={deletingAdminUserId}
                    onRequestDelete={setPendingDeleteUserId}
                  />
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
