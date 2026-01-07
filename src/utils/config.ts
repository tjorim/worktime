/**
 * Parse a YYYY-MM-DD date string as midnight UTC.
 *
 * If the input is not a valid date string, the returned Date will be invalid.
 *
 * @param dateString - Date string in `YYYY-MM-DD` format
 * @returns A Date representing the given date at 00:00:00.000 UTC; may be invalid if `dateString` is not a valid `YYYY-MM-DD`
 *
 * @example
 * parseUTCDate('2025-01-15')
 * // Returns: Date object for January 15, 2025 at 00:00:00.000 UTC
 *
 * @example
 * parseUTCDate('invalid')
 * // Returns: Invalid Date
 */
function parseUTCDate(dateString: string): Date {
  // Simple UTC parsing without dayjs dependency to avoid test issues
  return new Date(`${dateString}T00:00:00.000Z`);
}

export interface WorktimeConfig {
  REFERENCE_DATE: Date;
  REFERENCE_TEAM: number;
}

declare global {
  interface Window {
    WORKTIME_CONFIG?: {
      REFERENCE_DATE?: string;
      REFERENCE_TEAM?: number;
    };
  }
}

// Define constants that don't depend on configuration
const TEAMS_COUNT = 5;
const SHIFT_CYCLE_DAYS = 10;
const MAX_TRANSFERS_DISPLAY = 20;

export const CONFIG = {
  VERSION: __APP_VERSION__,
  REFERENCE_DATE: (() => {
    // Try to load from environment variable first
    if (import.meta.env.VITE_REFERENCE_DATE) {
      try {
        const envDate = parseUTCDate(import.meta.env.VITE_REFERENCE_DATE);
        if (!Number.isNaN(envDate.getTime())) {
          return envDate;
        }
      } catch {
        // Fall through to warning
      }
      console.warn("Invalid VITE_REFERENCE_DATE format, using default");
    }

    // Try to load from window config (for runtime configuration)
    if (typeof window !== "undefined" && window.WORKTIME_CONFIG?.REFERENCE_DATE) {
      try {
        const windowDate = parseUTCDate(window.WORKTIME_CONFIG.REFERENCE_DATE);
        if (!Number.isNaN(windowDate.getTime())) {
          return windowDate;
        }
      } catch {
        // Fall through to warning
      }
      console.warn("Invalid window.WORKTIME_CONFIG.REFERENCE_DATE format, using default");
    }

    // Fallback to default date (aligned with Team 1 starting August 1, 2022)
    return parseUTCDate("2025-07-16");
  })(),
  REFERENCE_TEAM: (() => {
    // Try to load from environment variable first
    if (import.meta.env.VITE_REFERENCE_TEAM) {
      const envTeam = parseInt(import.meta.env.VITE_REFERENCE_TEAM, 10);
      if (envTeam >= 1 && envTeam <= TEAMS_COUNT) {
        return envTeam;
      }
      console.warn("Invalid VITE_REFERENCE_TEAM value, using default");
    }

    // Try to load from window config (for runtime configuration)
    if (typeof window !== "undefined" && window.WORKTIME_CONFIG?.REFERENCE_TEAM) {
      const windowTeam = parseInt(String(window.WORKTIME_CONFIG.REFERENCE_TEAM), 10);
      if (windowTeam >= 1 && windowTeam <= TEAMS_COUNT) {
        return windowTeam;
      }
      console.warn("Invalid window.WORKTIME_CONFIG.REFERENCE_TEAM value, using default");
    }

    // Fallback to default team
    return 1;
  })(),
  SHIFT_CYCLE_DAYS,
  TEAMS_COUNT,
  MAX_TRANSFERS_DISPLAY,
} as const;
