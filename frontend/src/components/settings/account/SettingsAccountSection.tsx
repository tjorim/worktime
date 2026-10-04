import {
  CircleUser as CircleUserIcon,
  CloudCheck as CloudCheckIcon,
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Save as SaveIcon,
  Smartphone as SmartphoneIcon,
  Trash2 as Trash2Icon,
  UserCheck as UserCheckIcon,
  UserX as UserXIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  SettingsLoading,
  SettingsRowText,
  SettingsSection,
  SettingsHint,
} from "@/components/settings/SettingsParts";
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
  onLogin,
}: SettingsAccountSectionProps) {
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  return (
    <SettingsSection icon={CircleUserIcon} title={m.account_section_title()}>
      {isValidating ? (
        <SettingsLoading>{m.loading()}</SettingsLoading>
      ) : isAuthenticated ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <SettingsRowText
              icon={UserCheckIcon}
              iconClassName="text-success"
              title={
                resolvedDisplayName
                  ? m.auth_logged_in_as({ displayName: resolvedDisplayName })
                  : m.account_signed_in()
              }
              description={username ? `@${username}` : null}
            />
            <Button variant="outline" size="sm" onClick={onLogout}>
              <Icon icon={LogOutIcon} />
              {m.auth_logout()}
            </Button>
          </div>

          {profileError ? <Alert variant="warning">{profileError}</Alert> : null}

          <Alert variant="info">
            <div>
              {m.account_privacy_notice_body()}{" "}
              <Link to="/privacy" className="font-medium underline underline-offset-3">
                {m.account_privacy_notice_link()}
              </Link>
            </div>
          </Alert>

          {isProfileLoading && accountId === null ? (
            <SettingsLoading>{m.loading()}</SettingsLoading>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="account-display-name">
                  {m.account_profile_display_name_label()}
                </FieldLabel>
                <Input
                  id="account-display-name"
                  type="text"
                  value={profileDraft}
                  onChange={(event) => onProfileDraftChange(event.target.value)}
                  placeholder={m.account_profile_display_name_placeholder()}
                  disabled={accountId === null || isProfileSaving}
                  aria-describedby="account-display-name-help"
                />
                <FieldDescription id="account-display-name-help" className="mb-0">
                  {m.account_profile_display_name_description()}
                </FieldDescription>
              </Field>

              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">{m.account_profile_username_label()}:</span>{" "}
                  {username ?? "—"}
                </div>
                <div>
                  <span className="font-medium">{m.account_profile_user_id_label()}:</span>{" "}
                  {accountId ?? userId ?? "—"}
                </div>
                <div>
                  <span className="font-medium">{m.account_profile_role_label()}:</span>{" "}
                  {isAdmin ? m.account_profile_role_admin() : m.account_profile_role_member()}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={onSaveProfile}
                  disabled={!hasProfileChanges || isProfileSaving || accountId === null}
                >
                  <Icon icon={SaveIcon} />
                  {isProfileSaving ? m.account_profile_saving_btn() : m.account_profile_save_btn()}
                </Button>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="m-0 text-base font-medium text-danger-text">
                  {m.account_delete_section_title()}
                </h3>
                <SettingsHint>{m.account_delete_description()}</SettingsHint>
                {deleteAccountError ? (
                  <Alert variant="destructive">{deleteAccountError}</Alert>
                ) : null}
                <div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeletingAccount}
                    onClick={() => setShowDeleteAccountConfirm(true)}
                  >
                    <Icon icon={Trash2Icon} />
                    {isDeletingAccount ? m.account_delete_busy() : m.account_delete_btn()}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SettingsRowText
            icon={UserXIcon}
            iconClassName="text-muted-foreground"
            title={m.account_not_signed_in()}
            description={m.account_sync_benefits()}
          />
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>
              <Icon icon={CloudCheckIcon} className="mr-1 text-success" />
              {m.account_sync_benefit_backup()}
            </span>
            <span>
              <Icon icon={SmartphoneIcon} className="mr-1 text-success" />
              {m.account_sync_benefit_crossdevice()}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onLogin}>
              <Icon icon={LogInIcon} />
              {m.account_sign_in_btn()}
            </Button>
          </div>
        </div>
      )}
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
        icon={Trash2Icon}
      />
    </SettingsSection>
  );
}
