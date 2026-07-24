import { useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { readErrorDetail } from "@/utils/apiClient";

interface AccountProfile {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  capabilities: {
    backup_enabled: boolean;
  };
}

interface UseSettingsAccountParams {
  isAuthenticated: boolean;
  displayName: string | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  showSuccessToast: (message: string, icon?: string) => void;
  onAccountDeleted: () => void;
}

export function useSettingsAccount({
  isAuthenticated,
  displayName,
  fetchFn,
  showSuccessToast,
  onAccountDeleted,
}: UseSettingsAccountParams) {
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setAccountProfile(null);
      setProfileDraft("");
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    let isCancelled = false;
    setIsProfileLoading(true);
    setProfileError(null);

    fetchFn("/api/me")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        const profile = (await response.json()) as AccountProfile;
        if (isCancelled) return;
        setAccountProfile(profile);
        setProfileDraft(profile.display_name);
      })
      .catch((error) => {
        if (isCancelled) return;
        logger.error("Failed to load account profile:", error);
        setProfileError(m.account_profile_load_failed());
      })
      .finally(() => {
        if (!isCancelled) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, fetchFn]);

  const hasProfileChanges =
    accountProfile !== null &&
    profileDraft.trim() !== "" &&
    profileDraft.trim() !== accountProfile.display_name;

  const resolvedDisplayName = accountProfile?.display_name ?? displayName;

  const handleSaveProfile = async () => {
    if (!accountProfile) return;
    const nextDisplayName = profileDraft.trim();
    if (!nextDisplayName) {
      setProfileError(m.account_profile_display_name_required());
      return;
    }

    setIsProfileSaving(true);
    setProfileError(null);

    try {
      const response = await fetchFn(`/api/users/${accountProfile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: nextDisplayName }),
      });
      if (!response.ok) {
        throw new Error(`Unexpected status: ${response.status}`);
      }
      const updatedProfile = (await response.json()) as {
        id: number;
        username: string;
        display_name: string;
      };
      setAccountProfile((current) =>
        current
          ? {
              ...current,
              username: updatedProfile.username,
              display_name: updatedProfile.display_name,
            }
          : current,
      );
      setProfileDraft(updatedProfile.display_name);
      showSuccessToast(m.account_profile_saved(), "bi-person-check");
    } catch (error) {
      logger.error("Failed to save account profile:", error);
      setProfileError(m.account_profile_save_failed());
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const response = await fetchFn("/api/me", { method: "DELETE" });
      if (!response.ok) {
        throw new Error((await readErrorDetail(response)) ?? m.account_delete_failed());
      }

      showSuccessToast(m.account_deleted(), "bi-trash");
      onAccountDeleted();
    } catch (error) {
      logger.error("Failed to delete account:", error);
      setDeleteAccountError(
        error instanceof Error && error.message.trim() !== "" ? error.message : m.account_delete_failed(),
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return {
    accountProfile,
    profileDraft,
    setProfileDraft,
    isProfileLoading,
    isProfileSaving,
    profileError,
    hasProfileChanges,
    resolvedDisplayName,
    handleSaveProfile,
    isDeletingAccount,
    deleteAccountError,
    handleDeleteAccount,
  };
}

