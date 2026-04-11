import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";

import { useSettings } from "@/contexts/SettingsContext";
import { dayjs } from "@/utils/dateTimeUtils";
import type { WorkLocation, WorkLocationInfo, WorkLocationMap } from "@/types/workLocation";
import type { WorkLocationEntry } from "@/types/workLocation";
import { toCountryCode } from "@/types/workLocation";
import { workLocationsCollection } from "@/db/collections";

/**
 * Manages per-day work location storage backed by `workLocationsCollection`.
 *
 * Days without an explicit entry default to "office" using the user's
 * officeCountry setting — callers handle the null case from getLocationForDate.
 *
 * @param year - The calendar year to manage work locations for (retained for
 *   API compatibility; filtering is no longer needed since the collection holds
 *   all years in one flat store).
 */
export function useWorkLocationStorage(year: number) {
  const { settings } = useSettings();
  const { homeCountry, officeCountry } = settings;

  const { data: rawData } = useLiveQuery(workLocationsCollection);

  /**
   * Map of explicitly set work locations for calendar consumption.
   * Contains every day for which the user has stored an explicit location.
   *
   * `location` is derived from `countryCode` vs. current profile settings so
   * it reflects the user's current home/office configuration rather than the
   * value at write time.
   */
  const workLocationMap: WorkLocationMap = useMemo(() => {
    const entries = (rawData ?? []) as WorkLocationEntry[];
    return new Map(
      entries.map((wl) => {
        let location: WorkLocation;
        if (wl.countryCode === homeCountry) {
          location = "home";
        } else if (wl.countryCode === officeCountry) {
          location = "office";
        } else {
          location = "other";
        }
        return [
          wl.date,
          {
            location,
            countryCode: wl.countryCode,
            ...(wl.label ? { label: wl.label } : {}),
          } as WorkLocationInfo,
        ];
      }),
    );
  }, [rawData, homeCountry, officeCountry]);

  /**
   * Returns the explicitly stored work location for a given date, or null if
   * none has been set.
   */
  const getLocationForDate = useCallback(
    (date: Dayjs | Date | string): WorkLocationInfo | null => {
      const d = dayjs(date);
      if (!d.isValid()) return null;
      return workLocationMap.get(d.format("YYYY-MM-DD")) ?? null;
    },
    [workLocationMap],
  );

  /**
   * Stores an explicit work location for a given date.
   *
   * For "home" and "office" locations, the country code is derived from the
   * user's homeCountry / officeCountry setting. For "other" locations, the
   * caller must supply a valid ISO 3166-1 alpha-2 code via `extra.countryCode`.
   *
   * Returns `true` when the location was stored, `false` when the country
   * setting is missing/invalid or the date is invalid.
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
      if (!parsedCountryCode) return false;

      const d = dayjs(date);
      if (!d.isValid()) {
        console.warn("Invalid date passed to setLocationForDate:", date);
        return false;
      }
      const key = d.format("YYYY-MM-DD");
      const entry: WorkLocationEntry = {
        date: key,
        countryCode: parsedCountryCode,
        ...(extra?.label ? { label: extra.label } : {}),
      };

      if (workLocationsCollection.has(key)) {
        workLocationsCollection.update(key, (d: WorkLocationEntry) => {
          Object.assign(d, entry);
        });
      } else {
        workLocationsCollection.insert(entry);
      }

      return true;
    },
    [homeCountry, officeCountry],
  );

  /**
   * Removes the explicit work location for a given date, reverting to the default.
   */
  const clearLocationForDate = useCallback((date: Dayjs | Date | string) => {
    const d = dayjs(date);
    if (!d.isValid()) {
      console.warn("Invalid date passed to clearLocationForDate:", date);
      return;
    }
    const key = d.format("YYYY-MM-DD");
    if (!workLocationsCollection.has(key)) return;
    workLocationsCollection.delete(key);
  }, []);

  // Suppress unused-variable lint warning: `year` is kept in the signature for
  // API compatibility with callers that pass it, but is no longer used for
  // storage-key selection now that all years live in a single collection.
  void year;

  return {
    workLocationMap,
    getLocationForDate,
    setLocationForDate,
    clearLocationForDate,
  };
}

