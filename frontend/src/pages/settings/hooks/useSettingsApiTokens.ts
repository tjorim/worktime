import { useCallback, useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { readErrorDetail } from "@/utils/apiClient";

export interface ApiToken {
  id: string;
  name: string;
  token_preview: string;
  scopes: Array<"pebble:read" | "pebble:write">;
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedApiToken {
  id: string;
  name: string;
  token: string;
  scopes: Array<"pebble:read" | "pebble:write">;
}

interface UseSettingsApiTokensParams {
  isAuthenticated: boolean;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

export function useSettingsApiTokens({ isAuthenticated, fetchFn }: UseSettingsApiTokensParams) {
  const [apiTokens, setApiTokens] = useState<ApiToken[] | null>(null);
  const [isApiTokensLoading, setIsApiTokensLoading] = useState(false);
  const [apiTokensError, setApiTokensError] = useState<string | null>(null);
  const [isCreatingApiToken, setIsCreatingApiToken] = useState(false);
  const [createApiTokenError, setCreateApiTokenError] = useState<string | null>(null);
  const [createdApiToken, setCreatedApiToken] = useState<CreatedApiToken | null>(null);
  const [revokingApiTokenId, setRevokingApiTokenId] = useState<string | null>(null);
  const [revokeApiTokenError, setRevokeApiTokenError] = useState<string | null>(null);

  const loadApiTokens = useCallback(async () => {
    setIsApiTokensLoading(true);
    setApiTokensError(null);
    try {
      const response = await fetchFn("/api/access-tokens");
      if (!response.ok) {
        throw new Error(`Unexpected status: ${response.status}`);
      }
      const payload = (await response.json()) as { items: ApiToken[] };
      setApiTokens(payload.items);
    } catch (error) {
      logger.error("Failed to load API tokens:", error);
      setApiTokensError(m.api_tokens_load_failed());
    } finally {
      setIsApiTokensLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!isAuthenticated) {
      setApiTokens(null);
      setApiTokensError(null);
      return;
    }
    void loadApiTokens();
  }, [isAuthenticated, loadApiTokens]);

  const handleCreateApiToken = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setCreateApiTokenError(m.api_tokens_name_required());
      return;
    }

    setIsCreatingApiToken(true);
    setCreateApiTokenError(null);

    try {
      const response = await fetchFn("/api/access-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          scopes: ["pebble:read", "pebble:write"],
        }),
      });
      if (!response.ok) {
        throw new Error((await readErrorDetail(response)) ?? m.api_tokens_create_failed());
      }
      const created = (await response.json()) as CreatedApiToken;
      setCreatedApiToken(created);
      await loadApiTokens();
    } catch (error) {
      logger.error("Failed to create API token:", error);
      setCreateApiTokenError(
        error instanceof Error && error.message.trim() !== "" ? error.message : m.api_tokens_create_failed(),
      );
    } finally {
      setIsCreatingApiToken(false);
    }
  };

  const handleRevokeApiToken = async (tokenId: string) => {
    setRevokingApiTokenId(tokenId);
    setRevokeApiTokenError(null);

    try {
      const response = await fetchFn(`/api/access-tokens/${tokenId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error((await readErrorDetail(response)) ?? m.api_tokens_revoke_failed());
      }
      setApiTokens((current) => current?.filter((token) => token.id !== tokenId) ?? current);
      if (createdApiToken?.id === tokenId) {
        setCreatedApiToken(null);
      }
    } catch (error) {
      logger.error("Failed to revoke API token:", error);
      setRevokeApiTokenError(
        error instanceof Error && error.message.trim() !== "" ? error.message : m.api_tokens_revoke_failed(),
      );
    } finally {
      setRevokingApiTokenId(null);
    }
  };

  return {
    apiTokens,
    isApiTokensLoading,
    apiTokensError,
    isCreatingApiToken,
    createApiTokenError,
    createdApiToken,
    dismissCreatedApiToken: () => setCreatedApiToken(null),
    handleCreateApiToken: (name: string) => void handleCreateApiToken(name),
    revokingApiTokenId,
    revokeApiTokenError,
    handleRevokeApiToken: (tokenId: string) => void handleRevokeApiToken(tokenId),
  };
}
