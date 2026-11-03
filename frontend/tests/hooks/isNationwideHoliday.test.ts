import { expect, it } from "vitest";
import { isNationwideHoliday, type PublicHoliday } from "@/hooks/usePublicHolidays";

const base: PublicHoliday = {
  date: "2026-01-06",
  name: "Epiphany",
  localName: "Heilige Drei Könige",
  global: true,
  counties: null,
  types: ["Public"],
};

it("treats only holidays without regional limits as nationwide", () => {
  expect(isNationwideHoliday(base)).toBe(true);
  expect(isNationwideHoliday({ ...base, global: false })).toBe(false);
  expect(isNationwideHoliday({ ...base, counties: ["DE-BW"] })).toBe(false);
  expect(isNationwideHoliday({ ...base, counties: [] })).toBe(true);
});
