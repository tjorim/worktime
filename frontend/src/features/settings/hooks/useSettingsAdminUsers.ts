import { type LucideIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/lib/logger";
import { ApiError, getErrorMessage } from "@/lib/api/apiError";
import { accountProfileErrorMessages, adminUserDeleteErrorMessages } from "@/lib/api/apiErrorCodes";
import type { UserRead, UserListResponse } from "@/api-types";

interface UseSettingsAdminUsersParams {
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentAccountId: number | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  showSuccessToast: (message: string, icon?: LucideIcon) => void;
}

export function useSettingsAdminUsers({
  isAuthenticated,
  isAdmin,
  currentAccountId,
  fetchFn,
  showSuccessToast,
}: UseSettingsAdminUsersParams) {
  const [adminUsers, setAdminUsers] = useState<UserRead[]>([]);
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersDeleteError, setAdminUsersDeleteError] = useState<string | null>(null);
  const [deletingAdminUserId, setDeletingAdminUserId] = useState<number | null>(null);

  // Reset the loaded list the moment the viewer stops being an authenticated
  // admin, rather than in an effect: this is a same-render response to that
  // eligibility flipping, not a side effect that needs to synchronize with
  // anything external.
  const isEligible = isAuthenticated && isAdmin;
  const [wasEligible, setWasEligible] = useState(isEligible);
  if (wasEligible !== isEligible) {
    setWasEligible(isEligible);
    if (!isEligible) {
      setAdminUsers([]);
      setAdminUsersError(null);
      setAdminUsersDeleteError(null);
      setIsAdminUsersLoading(false);
      setDeletingAdminUserId(null);
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      return;
    }

    let isCancelled = false;
    setIsAdminUsersLoading(true);
    setAdminUsersError(null);
    setAdminUsersDeleteError(null);

    fetchFn("/api/users?limit=100")
      .then(async (response) => {
        if (!response.ok) {
          throw await ApiError.fromResponse(response);
        }
        const payload = (await response.json()) as UserListResponse;
        if (isCancelled) return;
        setAdminUsers(payload.items);
      })
      .catch((error) => {
        if (isCancelled) return;
        logger.error("Failed to load admin user list:", error);
        setAdminUsersError(m.account_admin_users_load_failed());
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAdminUsersLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, isAdmin, fetchFn]);

  const handleRenameAdminUser = async (
    userId: number,
    username: string,
    onRenamed?: (user: UserRead) => void,
  ) => {
    try {
      const response = await fetchFn(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) throw await ApiError.fromResponse(response);
      const updated = (await response.json()) as UserRead;
      setAdminUsers((current) => current.map((user) => (user.id === userId ? updated : user)));
      onRenamed?.(updated);
      return null;
    } catch (error) {
      logger.error("Failed to rename admin-managed user:", error);
      return getErrorMessage(
        error,
        m.account_admin_users_rename_failed(),
        accountProfileErrorMessages,
      );
    }
  };

  const handleDeleteAdminUser = async (userId: number) => {
    if (currentAccountId === userId) {
      setAdminUsersDeleteError(m.account_admin_users_delete_self_blocked());
      return;
    }

    setDeletingAdminUserId(userId);
    setAdminUsersDeleteError(null);

    try {
      const response = await fetchFn(`/api/users/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw await ApiError.fromResponse(response);
      }

      setAdminUsers((current) => current.filter((user) => user.id !== userId));
      showSuccessToast(m.account_admin_users_deleted(), TrashIcon);
    } catch (error) {
      logger.error("Failed to delete admin-managed user:", error);
      setAdminUsersDeleteError(
        getErrorMessage(error, m.account_admin_users_delete_failed(), adminUserDeleteErrorMessages),
      );
    } finally {
      setDeletingAdminUserId(null);
    }
  };

  return {
    adminUsers,
    isAdminUsersLoading,
    adminUsersError,
    adminUsersDeleteError,
    deletingAdminUserId,
    handleRenameAdminUser,
    handleDeleteAdminUser,
  };
}
