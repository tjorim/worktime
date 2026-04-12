import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";
import * as m from "@/paraglide/messages.js";
import type { PaydayInfo } from "@/types/paydays";
import { usePublicApiClient } from "./usePublicApiClient";

async function fetchPaydates(
  year: number,
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({ country: DEFAULT_COUNTRY, year: String(year) });
  const response = await apiFetch(`/api/holidays/paydates?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch paydates: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<string[]>;
}

export function usePaydates(
  year: number,
  enabled: boolean = true,
) {
  const apiFetch = usePublicApiClient();
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled = enabled && isValidYear;

  const { data, isLoading, error } = useQuery<string[], Error>({
    queryKey: ["paydates", DEFAULT_COUNTRY, year],
    queryFn: ({ signal }) => fetchPaydates(year, apiFetch, signal),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60 * 24, // holiday data doesn't change intra-day
    retry: 1,
  });

  const paydayMap = useMemo((): Map<string, PaydayInfo> => {
    if (!isEnabled || !data) return new Map();
    const map = new Map<string, PaydayInfo>();
    for (const dateStr of data) {
      map.set(dateStr, { name: m.calendar_legend_payday() });
    }
    return map;
  }, [data, isEnabled]);

  return {
    paydayMap,
    loading: isLoading,
    error: error ? error.message : null,
  };
}
