import { describe, expect, expectTypeOf, it } from "vitest";
import type { TimeOffEntryRead } from "@/api-types";
import { TimeOffEntryReadEntryFlag } from "@/api-schema/timeOffEntryReadEntryFlag";
import { TimeOffEntryReadEntryKind } from "@/api-schema/timeOffEntryReadEntryKind";
import { TimeOffEntryReadEntryType } from "@/api-schema/timeOffEntryReadEntryType";
import {
  TIME_OFF_ENTRY_TYPES,
  isValidFlag,
  type TimeOffEntryFlag,
  type TimeOffEntryKind,
  type TimeOffEntryType,
} from "@/lib/timeOff/types";

// The camelCase time-off model is frontend-only, but its vocabularies are the backend's: an entry type,
// flag or kind the API does not know is rejected on push, and one the frontend lacks falls out of a pull.
describe("time-off vocabulary agrees with the API", () => {
  it("has the same types, flags and kinds at compile time", () => {
    expectTypeOf<TimeOffEntryType>().toEqualTypeOf<TimeOffEntryRead["entry_type"]>();
    expectTypeOf<TimeOffEntryFlag>().toEqualTypeOf<TimeOffEntryRead["entry_flag"]>();
    expectTypeOf<TimeOffEntryKind>().toEqualTypeOf<TimeOffEntryRead["entry_kind"]>();
  });

  it("has the same values at runtime", () => {
    expect([...TIME_OFF_ENTRY_TYPES].sort()).toEqual(
      Object.values(TimeOffEntryReadEntryType).sort(),
    );
    expect(Object.values(TimeOffEntryReadEntryFlag).every((flag) => isValidFlag(flag))).toBe(true);
    expect(Object.values(TimeOffEntryReadEntryKind).sort()).toEqual(["date", "range", "weekly"]);
  });
});
