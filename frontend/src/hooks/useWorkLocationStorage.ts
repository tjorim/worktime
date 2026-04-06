import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { useLocalStorage } from "./useLocalStorage";
import type { WorkLocation, WorkLocationInfo, WorkLocationMap } from "@/types/workLocation";
import { toCountryCode } from "@/types/workLocation";
import { getWorkLocationsStorageKey } from "@/constants/storageKeys";

/**
 * Raw storage shape persisted to localStorage.
 * Keys are date strings in YYYY-MM-DD format; values are WorkLocationInfo objects.
 */
type StoredWorkLocations = Record<string, WorkLocationInfo>;

/**
 * Manages per-day work location storage for a given year.
 *
 * Stores explicit work location overrides in localStorage under
 * `worktime_work_locations_{year}`. Days without an explicit entry default
 * to "office" using the user's officeCountry setting.
 *
 * @param year - The calendar year to manage work locations for
 * @returns An object with the location map and CRUD methods
 *
 * @example
 * const { workLocationMap, getLocationForDate, setLocationForDate, clearLocationForDate } =
 *   useWorkLocationStorage(2026);
 *
 * // Set today as WFH
 * setLocationForDate(dayjs(), "home");
 *
 * // Query a specific date — returns null when nothing has been explicitly set
 * const info = getLocationForDate("2026-02-20"); // null if not set
 */
export function useWorkLocationStorage(year: number) {
  const { settings } = useSettings();
  const { homeCountry, officeCountry } = settings;

  const storageKey = getWorkLocationsStorageKey(year);
  const prevStorageKey = getWorkLocationsStorageKey(year - 1);
  const nextStorageKey = getWorkLocationsStorageKey(year + 1);

  const [storedLocations, setStoredLocations] = useLocalStorage<StoredWorkLocations>(
    storageKey,
    {},
  );
  const [prevYearLocations, setPrevYearLocations] = useLocalStorage<StoredWorkLocations>(
    prevStorageKey,
    {},
  );
  const [nextYearLocations, setNextYearLocations] = useLocalStorage<StoredWorkLocations>(
    nextStorageKey,
    {},
  );

  /**
   * Map of explicitly set work locations for calendar consumption.
   * Only contains days where the user has explicitly set a location.
   */
  const workLocationMap: WorkLocationMap = useMemo(
    () =>
      new Map(Object.entries({ ...prevYearLocations, ...storedLocations, ...nextYearLocations })),
    [prevYearLocations, storedLocations, nextYearLocations],
  );

  /**
   * Returns the explicitly stored work location for a given date, or null if
   * none has been set. Never assumes a default — callers must handle the null
   * case rather than relying on an implicit office fallback.
   *
   * @param date - The date to query (YYYY-MM-DD string, Date, or Dayjs)
   * @returns The WorkLocationInfo for that day, or null if no location was set
   */
  const getLocationForDate = useCallback(
    (date: Dayjs | Date | string): WorkLocationInfo | null => {
      const d = dayjs(date);
      if (!d.isValid()) return null;
      const key = d.format("YYYY-MM-DD");
      return workLocationMap.get(key) ?? null;
    },
    [workLocationMap],
  );

  /**
   * Stores an explicit work location for a given date.
   *
   * For "home" and "office" locations, the country code is derived from the user's
   * homeCountry / officeCountry setting. For "other" locations, the caller must
   * supply a valid ISO 3166-1 alpha-2 code via `extra.countryCode`.
   *
   * The countryCode is captured at write time. Changing homeCountry/officeCountry
   * later does not retroactively update historical entries.
   *
   * @param date - The date to set (YYYY-MM-DD string, Date, or Dayjs)
   * @param location - The work location ("home", "office", or "other")
   * @param extra - For "other" locations: required countryCode and optional label
   * @returns `true` when the location was stored. Returns `false` when the relevant
   *   country setting is not configured or the code is invalid, or when the
   *   date year is outside the allowed {year-1, year, year+1} range (which also logs
   *   a warning). Callers can inspect logs to distinguish the failure mode.
   */
  const setLocationForDate = useCallback(
    (
      date: Dayjs | Date | string,
      location: WorkLocation,
      extra?: { countryCode?: string; label?: string },
    ): boolean => {
      let countryCode: string | null;
      if (location === "home") {
        countryCode = homeCountry;
      } else if (location === "office") {
        countryCode = officeCountry;
      } else {
        countryCode = extra?.countryCode ?? null;
      }

      const parsedCountryCode = countryCode ? toCountryCode(countryCode) : null;
      // Country must be a valid ISO alpha-2 code before a location can be stored
      if (!parsedCountryCode) {
        return false;
      }

      const d = dayjs(date);
      if (!d.isValid()) {
        console.warn("Invalid date passed to setLocationForDate:", date);
        return false;
      }
      const key = d.format("YYYY-MM-DD");
      const dateYear = d.year();
      const entry: WorkLocationInfo = {
        location,
        countryCode: parsedCountryCode,
        ...(extra?.label ? { label: extra.label } : {}),
      };

      if (dateYear === year - 1) {
        setPrevYearLocations((prev) => ({ ...prev, [key]: entry }));
      } else if (dateYear === year) {
        setStoredLocations((prev) => ({ ...prev, [key]: entry }));
      } else if (dateYear === year + 1) {
        setNextYearLocations((prev) => ({ ...prev, [key]: entry }));
      } else {
        console.warn(`Skipping work location update for out-of-range year: ${dateYear}`);
        return false;
      }
      return true;
    },
    [
      homeCountry,
      officeCountry,
      year,
      setStoredLocations,
      setPrevYearLocations,
      setNextYearLocations,
    ],
  );

  /**
   * Removes the explicit work location for a given date, reverting to the default.
   *
   * @param date - The date to clear (YYYY-MM-DD string, Date, or Dayjs)
   */
  const clearLocationForDate = useCallback(
    (date: Dayjs | Date | string) => {
      const d = dayjs(date);
      if (!d.isValid()) {
        console.warn("Invalid date passed to clearLocationForDate:", date);
        return;
      }
      const key = d.format("YYYY-MM-DD");
      const dateYear = d.year();

      const removeKey = (prev: StoredWorkLocations) => {
        const next = { ...prev };
        delete next[key];
        return next;
      };

      if (dateYear === year - 1) {
        setPrevYearLocations(removeKey);
      } else if (dateYear === year) {
        setStoredLocations(removeKey);
      } else if (dateYear === year + 1) {
        setNextYearLocations(removeKey);
      } else {
        console.warn(`Skipping work location clear for out-of-range year: ${dateYear}`);
      }
    },
    [year, setStoredLocations, setPrevYearLocations, setNextYearLocations],
  );

  return {
    workLocationMap,
    getLocationForDate,
    setLocationForDate,
    clearLocationForDate,
  };
}
