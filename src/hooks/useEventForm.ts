import { useCallback, useState } from "react";
import type { EventFlag, HdayEvent, TimeLocationFlag, TypeFlag } from "../lib/hday/types";
import { isValidDate } from "../lib/hday/validation";
import { dayjs } from "../utils/dateTimeUtils";
import {
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  DEFAULT_WEEKDAY,
} from "../components/timeoff/constants";

/**
 * Custom hook for managing event form state and validation.
 * Encapsulates all form-related state, validation logic, and handlers.
 */
export function useEventForm() {
  // Event form state
  const [eventType, setEventType] = useState<"range" | "weekly">("range");
  const [eventWeekday, setEventWeekday] = useState(DEFAULT_WEEKDAY);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);

  // Validation errors
  const [startDateError, setStartDateError] = useState("");
  const [endDateError, setEndDateError] = useState("");

  /**
   * Reset form to initial state.
   */
  const resetForm = useCallback(() => {
    setEventType("range");
    setEventWeekday(DEFAULT_WEEKDAY);
    setEventStart("");
    setEventEnd("");
    setEventTitle("");
    setEventFlags([]);
    setStartDateError("");
    setEndDateError("");
  }, []);

  /**
   * Validate the current form state.
   * @returns true if form is valid, false otherwise
   */
  const validateForm = useCallback((): boolean => {
    let valid = true;

    if (eventType === "range") {
      // Validate start date
      if (!eventStart) {
        setStartDateError("Start date is required");
        valid = false;
      } else if (!isValidDate(eventStart)) {
        setStartDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else {
        setStartDateError("");
      }

      // Validate end date
      if (eventEnd && !isValidDate(eventEnd)) {
        setEndDateError("Invalid date (e.g., Feb 30 or April 31)");
        valid = false;
      } else if (eventEnd && eventStart && isValidDate(eventStart) && dayjs(eventEnd).isBefore(dayjs(eventStart))) {
        setEndDateError("End date must be after start date");
        valid = false;
      } else {
        setEndDateError("");
      }
    }

    return valid;
  }, [eventType, eventStart, eventEnd]);

  /**
   * Prefill form fields from an existing event.
   * @param event - The event to load into the form
   */
  const prefillFormFromEvent = useCallback((event: HdayEvent) => {
    if (event.type === "range") {
      setEventType("range");
      setEventStart(event.start || "");
      setEventEnd(event.end || "");
      setEventWeekday(DEFAULT_WEEKDAY);
    } else if (event.type === "weekly") {
      setEventType("weekly");
      setEventWeekday(event.weekday || DEFAULT_WEEKDAY);
      setEventStart("");
      setEventEnd("");
    }

    setEventTitle(event.title || "");
    setEventFlags(event.flags || []);
    setStartDateError("");
    setEndDateError("");
  }, []);

  /**
   * Handle type flag change (mutually exclusive radio buttons).
   * @param flag - The selected type flag or "none"
   */
  const handleTypeFlagChange = useCallback((flag: TypeFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TYPE_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  }, []);

  /**
   * Handle time/location flag change (mutually exclusive radio buttons).
   * @param flag - The selected time/location flag or "none"
   */
  const handleTimeFlagChange = useCallback((flag: TimeLocationFlag | "none") => {
    if (flag === "none") {
      setEventFlags((prev) => prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f)));
    } else {
      setEventFlags((prev) => {
        const filtered = prev.filter((f) => !TIME_LOCATION_FLAGS_AS_EVENT_FLAGS.includes(f));
        return [...filtered, flag];
      });
    }
  }, []);

  return {
    // State
    eventType,
    eventWeekday,
    eventStart,
    eventEnd,
    eventTitle,
    eventFlags,
    startDateError,
    endDateError,

    // Setters
    setEventType,
    setEventWeekday,
    setEventStart,
    setEventEnd,
    setEventTitle,
    setEventFlags,

    // Methods
    resetForm,
    validateForm,
    prefillFormFromEvent,
    handleTypeFlagChange,
    handleTimeFlagChange,
  };
}
