import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient";
import type { LongWeekend, LongWeekendDayInfo } from "@/types/longWeekend";
import { dayjs } from "@/utils/dateTimeUtils";

const DEFAULT_COUNTRY = "NL";

async function fetchLongWeekends(
  country: string,
  year: number,
  availableBridgeDays: number,
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<LongWeekend[]> {
  const params = new URLSearchParams({
    country,
    year: String(year),
    availableBridgeDays: String(availableBridgeDays),
  });
  const response = await apiFetch(`/api/holidays/longweekend?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch long weekends: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<LongWeekend[]>;
}

/**
 * Expands a list of long weekend periods into a per-day map.
 *
 * Each date in [startDate, endDate] gets an entry. Bridge days are flagged
 * separately so callers can apply different styling.
 */
function toLongWeekendMap(periods: LongWeekend[]): Map<string, LongWeekendDayInfo> {
  const map = new Map<string, LongWeekendDayInfo>();
  const bridgeDaySet = new Set(periods.flatMap((p) => p.bridgeDays));

  for (const period of periods) {
    let current = dayjs(period.startDate);
    const end = dayjs(period.endDate);
    while (current.isSameOrBefore(end, "day")) {
      const key = current.format("YYYY-MM-DD");
      map.set(key, {
        isBridgeDay: bridgeDaySet.has(key),
        dayCount: period.dayCount,
      });
      current = current.add(1, "day");
    }
  }

  return map;
}

/**
 * Fetches long weekend opportunities from the backend for a given year.
 *
 * Returns a map from YYYY-MM-DD date strings to {@link LongWeekendDayInfo}.
 * The map is empty when the feature is disabled (maxBridgeDays === 0) or
 * when the schedule is not the standard 9-5 roster.
 *
 * @param year - Calendar year to fetch for.
 * @param maxBridgeDays - Maximum bridge days to include. 0 disables the feature.
 * @param countryCode - ISO 3166-1 alpha-2 country code.
 * @param enabled - External enabled flag (e.g. schedule is standard 9-5).
 */
export function useLongWeekend(
  year: number,
  maxBridgeDays: number,
  countryCode: string = DEFAULT_COUNTRY,
  enabled: boolean = true,
) {
  const apiFetch = useApiClient();
  const isTestEnv = import.meta.env.MODE === "test";
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled =
    enabled && !isTestEnv && Boolean(countryCode) && isValidYear && maxBridgeDays > 0;

  const { data, isLoading, error } = useQuery<LongWeekend[], Error>({
    queryKey: ["longWeekend", countryCode, year, maxBridgeDays],
    queryFn: ({ signal }) =>
      fetchLongWeekends(countryCode, year, maxBridgeDays, apiFetch, signal),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60 * 24, // long weekend data doesn't change intra-day
    retry: 1,
  });

  const longWeekendMap = useMemo(
    () => (isEnabled && data ? toLongWeekendMap(data) : new Map<string, LongWeekendDayInfo>()),
    [data, isEnabled],
  );

  return {
    longWeekendMap,
    loading: isLoading,
    error: error ? error.message : null,
  };
}
