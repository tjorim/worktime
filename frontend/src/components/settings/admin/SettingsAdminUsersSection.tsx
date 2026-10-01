import { Trash2 as Trash2Icon, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  SettingsHint,
  SettingsLoading,
  SettingsSection,
} from "@/components/settings/SettingsParts";
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
    <SettingsSection icon={UsersIcon} title={m.account_admin_users_title()}>
      <SettingsHint className="tw:mb-2">{m.account_admin_users_description()}</SettingsHint>
      {isAdminUsersLoading ? (
        <SettingsLoading>{m.account_admin_users_loading()}</SettingsLoading>
      ) : adminUsersError ? (
        <Alert variant="warning">{adminUsersError}</Alert>
      ) : (
        <div className="tw:flex tw:flex-col tw:gap-2">
          {adminUsersDeleteError ? (
            <Alert variant="destructive">{adminUsersDeleteError}</Alert>
          ) : null}
          {adminUsers.length === 0 ? (
            <SettingsHint>{m.account_admin_users_empty()}</SettingsHint>
          ) : (
            <AdminUsersTable
              users={adminUsers}
              currentAccountId={currentAccountId}
              deletingAdminUserId={deletingAdminUserId}
              onRequestDelete={setPendingDeleteUserId}
            />
          )}
        </div>
      )}
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
        icon={Trash2Icon}
      />
    </SettingsSection>
  );
}
