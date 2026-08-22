import { useCallback, useEffect, useRef, useState } from "react";
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
  accountIdentity: string | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

export function useSettingsIntegrationClients({ isAuthenticated, accountIdentity, fetchFn }: Params) {
  const [clients, setClients] = useState<IntegrationClient[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdClient, setCreatedClient] = useState<CreatedIntegrationClient | null>(null);
  const [busyClientId, setBusyClientId] = useState<number | null>(null);
  // State updates do not become visible until the next render. Keep a synchronous
  // guard as well so two mutation callbacks invoked in the same tick cannot issue
  // overlapping one-time keys and overwrite the only copy of either secret.
  const mutationInFlight = useRef(false);
  const sessionGeneration = useRef(0);
  const loadGeneration = useRef(0);

  const loadClients = useCallback(async (expectedSession = sessionGeneration.current) => {
    const expectedLoad = ++loadGeneration.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchFn("/api/integration-clients");
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_load_failed());
      const payload = (await response.json()) as { items: IntegrationClient[] };
      if (sessionGeneration.current !== expectedSession || loadGeneration.current !== expectedLoad) return;
      setClients(payload.items);
    } catch (loadError) {
      if (sessionGeneration.current !== expectedSession || loadGeneration.current !== expectedLoad) return;
      logger.error("Failed to load integration clients:", loadError);
      setError(loadError instanceof Error ? loadError.message : m.integration_clients_load_failed());
    } finally {
      if (sessionGeneration.current === expectedSession && loadGeneration.current === expectedLoad) {
        setIsLoading(false);
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    const generation = ++sessionGeneration.current;
    loadGeneration.current += 1;
    mutationInFlight.current = false;
    setClients(null);
    setError(null);
    setCreatedClient(null);
    setIsCreating(false);
    setBusyClientId(null);
    setIsLoading(false);
    if (isAuthenticated && accountIdentity !== null) void loadClients(generation);
  }, [isAuthenticated, accountIdentity, loadClients]);

  const createClient = async (name: string, scopes: IntegrationClientScope[]) => {
    if (mutationInFlight.current || createdClient) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(m.integration_clients_name_required());
      return;
    }
    mutationInFlight.current = true;
    const generation = sessionGeneration.current;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetchFn("/api/integration-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, scopes }),
      });
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_create_failed());
      const created = (await response.json()) as CreatedIntegrationClient;
      if (sessionGeneration.current !== generation) return;
      setCreatedClient(created);
      await loadClients(generation);
    } catch (createError) {
      if (sessionGeneration.current !== generation) return;
      logger.error("Failed to create integration client:", createError);
      setError(createError instanceof Error ? createError.message : m.integration_clients_create_failed());
    } finally {
      if (sessionGeneration.current === generation) {
        mutationInFlight.current = false;
        setIsCreating(false);
      }
    }
  };

  const rotateClient = async (clientId: number) => {
    if (mutationInFlight.current || createdClient) return;
    mutationInFlight.current = true;
    const generation = sessionGeneration.current;
    setBusyClientId(clientId);
    setError(null);
    try {
      const response = await fetchFn(`/api/integration-clients/${clientId}/rotate`, { method: "POST" });
      if (!response.ok) throw new Error((await readErrorDetail(response)) ?? m.integration_clients_rotate_failed());
      const rotated = (await response.json()) as CreatedIntegrationClient;
      if (sessionGeneration.current !== generation) return;
      setCreatedClient(rotated);
      await loadClients(generation);
    } catch (rotateError) {
      if (sessionGeneration.current !== generation) return;
      logger.error("Failed to rotate integration client:", rotateError);
      setError(rotateError instanceof Error ? rotateError.message : m.integration_clients_rotate_failed());
    } finally {
      if (sessionGeneration.current === generation) {
        mutationInFlight.current = false;
        setBusyClientId(null);
      }
    }
  };

  const revokeClient = async (clientId: number) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const generation = sessionGeneration.current;
    setBusyClientId(clientId);
    setError(null);
    try {
      const response = await fetchFn(`/api/integration-clients/${clientId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error((await readErrorDetail(response)) ?? m.integration_clients_revoke_failed());
      }
      if (sessionGeneration.current !== generation) return;
      setCreatedClient((current) => current?.id === clientId ? null : current);
      await loadClients(generation);
    } catch (revokeError) {
      if (sessionGeneration.current !== generation) return;
      logger.error("Failed to revoke integration client:", revokeError);
      setError(revokeError instanceof Error ? revokeError.message : m.integration_clients_revoke_failed());
    } finally {
      if (sessionGeneration.current === generation) {
        mutationInFlight.current = false;
        setBusyClientId(null);
      }
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
