import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient";
import type { PaydayInfo } from "@/types/paydays";

const PAYDAY_LABEL = "Payday";
const DEFAULT_COUNTRY = "NL";
const DEFAULT_LANGUAGE = "EN";

async function fetchPaydates(
  country: string,
  year: number,
  language: string,
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({ country, year: String(year), language });
  const response = await apiFetch(`/api/holidays/paydates?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch paydates: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<string[]>;
}

export function usePaydates(
  year: number,
  countryCode: string = DEFAULT_COUNTRY,
  language: string = DEFAULT_LANGUAGE,
  enabled: boolean = true,
) {
  const apiFetch = useApiClient();
  const isTestEnv = import.meta.env.MODE === "test";
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled = enabled && !isTestEnv && Boolean(countryCode) && isValidYear;

  const { data, isLoading, error } = useQuery<string[], Error>({
    queryKey: ["paydates", countryCode, year, language],
    queryFn: ({ signal }) => fetchPaydates(countryCode, year, language, apiFetch, signal),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60 * 24, // holiday data doesn't change intra-day
    retry: 1,
  });

  const paydayMap = useMemo((): Map<string, PaydayInfo> => {
    if (!isEnabled || !data) return new Map();
    const map = new Map<string, PaydayInfo>();
    for (const dateStr of data) {
      map.set(dateStr, { name: PAYDAY_LABEL });
    }
    return map;
  }, [data, isEnabled]);

  return {
    paydayMap,
    loading: isLoading,
    error: error ? error.message : null,
  };
}
