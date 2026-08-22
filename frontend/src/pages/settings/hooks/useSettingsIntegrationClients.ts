import { useCallback, useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { readErrorDetail } from "@/utils/apiClient";
import { logger } from "@/utils/logger";

export type IntegrationClientScope = "worktime:mcp" | "worktime:admin";

export interface IntegrationClient {
  id: number;
  name: string;
  key_preview: string;
  scopes: IntegrationClientScope[];
  rate_limit_per_minute: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface CreatedIntegrationClient {
  id: number;
  name: string;
  key: string;
  scopes: IntegrationClientScope[];
  rate_limit_per_minute: number;
  created_at: string;
}

interface Params {
  isAuthenticated: boolean;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

export function useSettingsIntegrationClients({ isAuthenticated, fetchFn }: Params) {
  const [clients, setClients] = useState<IntegrationClient[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdClient, setCreatedClient] = useState<CreatedIntegrationClient | null>(null);
  const [busyClientId, setBusyClientId] = useState<number | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchFn("/api/integration-clients");
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_load_failed());
      const payload = (await response.json()) as { items: IntegrationClient[] };
      setClients(payload.items);
    } catch (loadError) {
      logger.error("Failed to load integration clients:", loadError);
      setError(loadError instanceof Error ? loadError.message : m.integration_clients_load_failed());
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!isAuthenticated) {
      setClients(null);
      setError(null);
      return;
    }
    void loadClients();
  }, [isAuthenticated, loadClients]);

  const createClient = async (name: string, scopes: IntegrationClientScope[]) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(m.integration_clients_name_required());
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetchFn("/api/integration-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, scopes }),
      });
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_create_failed());
      setCreatedClient((await response.json()) as CreatedIntegrationClient);
      await loadClients();
    } catch (createError) {
      logger.error("Failed to create integration client:", createError);
      setError(createError instanceof Error ? createError.message : m.integration_clients_create_failed());
    } finally {
      setIsCreating(false);
    }
  };

  const rotateClient = async (clientId: number) => {
    setBusyClientId(clientId);
    setError(null);
    try {
      const response = await fetchFn(`/api/integration-clients/${clientId}/rotate`, { method: "POST" });
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_rotate_failed());
      setCreatedClient((await response.json()) as CreatedIntegrationClient);
      await loadClients();
    } catch (rotateError) {
      logger.error("Failed to rotate integration client:", rotateError);
      setError(rotateError instanceof Error ? rotateError.message : m.integration_clients_rotate_failed());
    } finally {
      setBusyClientId(null);
    }
  };

  const revokeClient = async (clientId: number) => {
    setBusyClientId(clientId);
    setError(null);
    try {
      const response = await fetchFn(`/api/integration-clients/${clientId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error((await readErrorDetail(response)) ?? m.integration_clients_revoke_failed());
      }
      await loadClients();
    } catch (revokeError) {
      logger.error("Failed to revoke integration client:", revokeError);
      setError(revokeError instanceof Error ? revokeError.message : m.integration_clients_revoke_failed());
    } finally {
      setBusyClientId(null);
    }
  };

  return {
    clients, isLoading, error, isCreating, createdClient, busyClientId,
    dismissCreatedClient: () => setCreatedClient(null),
    createClient: (name: string, scopes: IntegrationClientScope[]) => void createClient(name, scopes),
    rotateClient: (clientId: number) => void rotateClient(clientId),
    revokeClient: (clientId: number) => void revokeClient(clientId),
  };
}
