import { useCallback, useEffect, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";

export interface AuditEntry {
  id: number;
  actor_user_id: number | null;
  actor_label: string;
  subject: string | null;
  auth_source: string;
  action: string;
  resource_type: string;
  resource_id: string;
  request_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 25;

interface UseSettingsAuditTrailParams {
  enabled: boolean;
  userId?: number;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}

export function useSettingsAuditTrail({ enabled, userId, fetchFn }: UseSettingsAuditTrailParams) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (beforeId?: number) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (userId !== undefined) params.set("user_id", String(userId));
      if (beforeId !== undefined) params.set("before_id", String(beforeId));

      const response = await fetchFn(`/api/audit?${params.toString()}`);
      if (!response.ok) throw new Error(`Unexpected status: ${response.status}`);
      const payload = (await response.json()) as { items?: AuditEntry[] };
      return payload.items ?? [];
    },
    [fetchFn, userId],
  );

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetchPage()
      .then((items) => {
        if (isCancelled) return;
        setEntries(items);
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch((loadError) => {
        if (isCancelled) return;
        logger.error("Failed to load audit trail:", loadError);
        setError(m.audit_trail_load_failed());
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [enabled, fetchPage]);

  const loadMore = async () => {
    const beforeId = entries.at(-1)?.id;
    if (beforeId === undefined || isLoadingMore) return;

    setIsLoadingMore(true);
    setError(null);
    try {
      const items = await fetchPage(beforeId);
      setEntries((current) => [...current, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch (loadError) {
      logger.error("Failed to load more audit entries:", loadError);
      setError(m.audit_trail_load_failed());
    } finally {
      setIsLoadingMore(false);
    }
  };

  return { entries, isLoading, isLoadingMore, error, hasMore, loadMore };
}
