import { useCallback, useMemo } from "react";

import { useSettings } from "../contexts/SettingsContext";
import { dayjs, formatHdayDate } from "../utils/dateTimeUtils";
import { useLocalStorage } from "./useLocalStorage";
import type { WorkLocation, WorkLocationInfo, WorkLocationMap } from "../types/workLocation";

/**
 * Raw storage shape persisted to localStorage.
 * Keys are date strings in YYYY/MM/DD format; values are WorkLocationInfo objects.
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
 * // Query a specific date (falls back to office default when not set)
 * const info = getLocationForDate("2026/02/20"); // { location: "office", countryCode: "NL" }
 */
export function useWorkLocationStorage(year: number) {
  const { settings } = useSettings();

  const storageKey = `worktime_work_locations_${year}`;
  const prevStorageKey = `worktime_work_locations_${year - 1}`;
  const nextStorageKey = `worktime_work_locations_${year + 1}`;

  const [storedLocations, setStoredLocations] = useLocalStorage<StoredWorkLocations>(
    storageKey,
    {},
  );
  const [prevYearLocations] = useLocalStorage<StoredWorkLocations>(prevStorageKey, {});
  const [nextYearLocations] = useLocalStorage<StoredWorkLocations>(nextStorageKey, {});

  /**
   * Map of explicitly set work locations for calendar consumption.
   * Only contains days where the user has explicitly set a location.
   * Use getLocationForDate for queries that should fall back to the office default.
   */
  const workLocationMap: WorkLocationMap = useMemo(
    () => new Map(Object.entries(storedLocations)),
    [storedLocations],
  );

  /**
   * Returns the work location for a given date.
   *
   * If no explicit location is stored, falls back to the office default
   * derived from the user's officeCountry setting. Returns null when
   * neither a stored location nor an officeCountry setting exists.
   *
   * @param date - The date to query (YYYY/MM/DD string, Date, or Dayjs)
   * @returns The WorkLocationInfo for that day, or null if unresolvable
   */
  const getLocationForDate = useCallback(
    (date: dayjs.Dayjs | Date | string): WorkLocationInfo | null => {
      const key = formatHdayDate(date);
      const stored = storedLocations[key];
      if (stored) {
        return stored;
      }

      // Default-to-office: derive country from officeCountry setting
      const { officeCountry } = settings;
      if (officeCountry) {
        return { location: "office", countryCode: officeCountry };
      }

      return null;
    },
    [storedLocations, settings.officeCountry],
  );

  /**
   * Stores an explicit work location for a given date.
   *
   * The country code is derived from the user's homeCountry setting (for "home")
   * or officeCountry setting (for "office"). If the relevant country setting is
   * not configured, the call is a no-op.
   *
   * @param date - The date to set (YYYY/MM/DD string, Date, or Dayjs)
   * @param location - The work location ("home" or "office")
   * @returns `true` when the location was stored, `false` when the relevant country
   *   setting (homeCountry or officeCountry) is not configured
   */
  const setLocationForDate = useCallback(
    (date: dayjs.Dayjs | Date | string, location: WorkLocation): boolean => {
      const countryCode = location === "home" ? settings.homeCountry : settings.officeCountry;

      // Country must be configured before a location can be stored
      if (!countryCode) {
        return false;
      }

      const key = formatHdayDate(date);
      setStoredLocations((prev) => ({
        ...prev,
        [key]: { location, countryCode },
      }));
      return true;
    },
    [settings.homeCountry, settings.officeCountry, setStoredLocations],
  );

  /**
   * Removes the explicit work location for a given date, reverting to the default.
   *
   * @param date - The date to clear (YYYY/MM/DD string, Date, or Dayjs)
   */
  const clearLocationForDate = useCallback(
    (date: dayjs.Dayjs | Date | string) => {
      const key = formatHdayDate(date);
      setStoredLocations((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setStoredLocations],
  );

  /**
   * Returns a WorkLocationMap that covers all seven days of the ISO week containing
   * the given date, merging data from adjacent years when the week spans a year boundary
   * (e.g. a week covering both 31 Dec and 1 Jan).
   *
   * @param weekStartDate - Any date within the target ISO week
   * @returns A merged WorkLocationMap for the full week
   */
  const getLocationsForWeek = useCallback(
    (weekStartDate: dayjs.Dayjs | Date | string): WorkLocationMap => {
      const monday = dayjs(weekStartDate).isoWeekday(1);
      const sunday = monday.add(6, "day");

      if (monday.year() === sunday.year()) {
        return new Map(Object.entries(storedLocations));
      }

      // Week spans two years: merge current year with the adjacent year
      const adjacentLocations =
        sunday.year() === year + 1 ? nextYearLocations : prevYearLocations;
      return new Map(Object.entries({ ...storedLocations, ...adjacentLocations }));
    },
    [storedLocations, prevYearLocations, nextYearLocations, year],
  );

  return {
    workLocationMap,
    getLocationForDate,
    setLocationForDate,
    clearLocationForDate,
    getLocationsForWeek,
  };
}
