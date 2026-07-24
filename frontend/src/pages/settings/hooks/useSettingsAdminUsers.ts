import { useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { readErrorDetail } from "@/utils/apiClient";

interface ManagedUser {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface UseSettingsAdminUsersParams {
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentAccountId: number | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  showSuccessToast: (message: string, icon?: string) => void;
}

export function useSettingsAdminUsers({
  isAuthenticated,
  isAdmin,
  currentAccountId,
  fetchFn,
  showSuccessToast,
}: UseSettingsAdminUsersParams) {
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersDeleteError, setAdminUsersDeleteError] = useState<string | null>(null);
  const [deletingAdminUserId, setDeletingAdminUserId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setAdminUsers([]);
      setAdminUsersError(null);
      setAdminUsersDeleteError(null);
      setIsAdminUsersLoading(false);
      setDeletingAdminUserId(null);
      return;
    }

    let isCancelled = false;
    setIsAdminUsersLoading(true);
    setAdminUsersError(null);
    setAdminUsersDeleteError(null);

    fetchFn("/api/users/?limit=100")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        const payload = (await response.json()) as {
          items?: ManagedUser[];
        };
        if (isCancelled) return;
        setAdminUsers(payload.items ?? []);
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
        throw new Error((await readErrorDetail(response)) ?? m.account_admin_users_delete_failed());
      }

      setAdminUsers((current) => current.filter((user) => user.id !== userId));
      showSuccessToast(m.account_admin_users_deleted(), "bi-trash");
    } catch (error) {
      logger.error("Failed to delete admin-managed user:", error);
      setAdminUsersDeleteError(
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : m.account_admin_users_delete_failed(),
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
    handleDeleteAdminUser,
  };
}
