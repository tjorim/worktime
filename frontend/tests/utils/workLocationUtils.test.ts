import { describe, it, expect } from "vitest";
import { aggregateLocationCounts } from "@/utils/workLocationUtils";
import { toCountryCode } from "@/types/workLocation";
import type { WorkLocation, WorkLocationInfo, WorkLocationMap } from "@/types/workLocation";

const cc = (value: string) => toCountryCode(value)!;
const HOME: WorkLocationInfo = { location: "home", countryCode: cc("NL") };
const OFFICE: WorkLocationInfo = { location: "office", countryCode: cc("BE") };
const OTHER_DE: WorkLocationInfo = { location: "other", countryCode: cc("DE") };

describe("aggregateLocationCounts", () => {
  it("returns an empty array for an empty map", () => {
    expect(aggregateLocationCounts(new Map())).toEqual([]);
  });

  it("groups entries by (location, countryCode) and sums day counts", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME],
      ["2026-01-06", HOME],
      ["2026-01-07", OFFICE],
    ]);
    const result = aggregateLocationCounts(map);
    // Two distinct groups
    expect(result).toHaveLength(2);
    const homeRow = result.find((r) => r.location === "home");
    const officeRow = result.find((r) => r.location === "office");
    expect(homeRow).toEqual({ location: "home", countryCode: "NL", days: 2 });
    expect(officeRow).toEqual({ location: "office", countryCode: "BE", days: 1 });
  });

  it("sorts by countryCode ascending, then days descending within the same country", () => {
    // HOME=NL(2), OFFICE=BE(1), OTHER_DE=DE(3) → by country: BE, DE, NL
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OFFICE], // BE, 1 day
      ["2026-01-06", HOME], // NL, 2 days
      ["2026-01-07", HOME],
      ["2026-01-08", OTHER_DE], // DE, 3 days
      ["2026-01-09", OTHER_DE],
      ["2026-01-10", OTHER_DE],
    ]);
    const result = aggregateLocationCounts(map);
    expect(result.map((r) => r.countryCode)).toEqual(["BE", "DE", "NL"]);
    // Within the same country, days are descending
    for (let i = 1; i < result.length; i++) {
      if (result[i - 1]!.countryCode === result[i]!.countryCode) {
        expect(result[i - 1]!.days).toBeGreaterThanOrEqual(result[i]!.days);
      }
    }
  });

  it("creates separate rows for other-location entries with different country codes", () => {
    const OTHER_US: WorkLocationInfo = { location: "other", countryCode: cc("US") };
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OTHER_DE],
      ["2026-01-06", OTHER_US],
      ["2026-01-07", OTHER_DE],
    ]);
    const result = aggregateLocationCounts(map);
    expect(result).toHaveLength(2);
    const deRow = result.find((r) => r.countryCode === "DE");
    const usRow = result.find((r) => r.countryCode === "US");
    expect(deRow?.days).toBe(2);
    expect(usRow?.days).toBe(1);
  });

  it("merges other-location entries with the same country regardless of label", () => {
    const OTHER_DE_LABEL: WorkLocationInfo = {
      location: "other",
      countryCode: cc("DE"),
      label: "Berlin office",
    };
    const OTHER_DE_NOLABEL: WorkLocationInfo = { location: "other", countryCode: cc("DE") };
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OTHER_DE_LABEL],
      ["2026-01-06", OTHER_DE_NOLABEL],
    ]);
    const result = aggregateLocationCounts(map);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ location: "other", countryCode: "DE", days: 2 });
  });

  it("skips entries with unknown locations and does not collide on separator characters in other fields", () => {
    // Defensive case: corrupted/tampered storage values with unknown locations are skipped.
    // Valid entries with separator characters in countryCode/label must not be merged.
    const entry1 = {
      location: "other:site", // invalid — skipped by guard
      countryCode: "DE",
      label: "foo:bar",
    } as unknown as WorkLocationInfo;
    const entry2 = {
      location: "other",
      countryCode: "DE:FR", // separator in countryCode
      label: "baz",
    } as unknown as WorkLocationInfo;
    const entry3 = {
      location: "other",
      countryCode: "DE",
      label: "foo:bar", // separator in label
    } as unknown as WorkLocationInfo;
    const map: WorkLocationMap = new Map([
      ["2026-01-01", entry1],
      ["2026-01-02", entry2],
      ["2026-01-03", entry3],
    ]);
    const result = aggregateLocationCounts(map);
    // entry1 is skipped (unknown location); entry2 and entry3 are distinct rows
    expect(result).toHaveLength(2);
    // entry1 must be absent — no row should carry its invalid location
    expect(result.some((r) => r.location === ("other:site" as WorkLocation))).toBe(false);
    // entry2 must appear as its own distinct row (countryCode "DE:FR" differs from entry3's "DE")
    expect(result).toContainEqual(
      expect.objectContaining({ location: "other", countryCode: "DE:FR" }),
    );
    // entry3 must appear as its own distinct row
    expect(result).toContainEqual(
      expect.objectContaining({ location: "other", countryCode: "DE" }),
    );
  });
});
