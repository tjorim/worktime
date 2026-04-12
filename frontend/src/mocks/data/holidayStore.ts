/**
 * Seed holiday data for MSW handlers.
 *
 * Provides deterministic public holidays, long weekends, school holidays,
 * and paydates for use in dev mode and integration tests.
 */

import type { PublicHoliday } from "@/hooks/usePublicHolidays";
import type { SchoolHoliday } from "@/hooks/useSchoolHolidays";
import type { LongWeekend } from "@/types/longWeekend";

// ---------------------------------------------------------------------------
// Public holidays — Dutch national holidays for 2026
// ---------------------------------------------------------------------------

export const seedPublicHolidays: PublicHoliday[] = [
  {
    date: "2026-01-01",
    name: "New Year's Day",
    localName: "Nieuwjaarsdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-04-03",
    name: "Good Friday",
    localName: "Goede Vrijdag",
    global: false,
    counties: null,
    types: ["Optional"],
  },
  {
    date: "2026-04-05",
    name: "Easter Sunday",
    localName: "Eerste Paasdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-04-06",
    name: "Easter Monday",
    localName: "Tweede Paasdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-04-27",
    name: "King's Day",
    localName: "Koningsdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-05-05",
    name: "Liberation Day",
    localName: "Bevrijdingsdag",
    global: false,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-05-14",
    name: "Ascension Day",
    localName: "Hemelvaartsdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-05-24",
    name: "Whit Sunday",
    localName: "Eerste Pinksterdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-05-25",
    name: "Whit Monday",
    localName: "Tweede Pinksterdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-12-25",
    name: "Christmas Day",
    localName: "Eerste Kerstdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
  {
    date: "2026-12-26",
    name: "Second Day of Christmas",
    localName: "Tweede Kerstdag",
    global: true,
    counties: null,
    types: ["Public"],
  },
];

// ---------------------------------------------------------------------------
// Long weekends for 2026
// ---------------------------------------------------------------------------

export const seedLongWeekends: LongWeekend[] = [
  {
    startDate: "2026-04-03",
    endDate: "2026-04-06",
    dayCount: 4,
    needBridgeDay: false,
    bridgeDays: [],
  },
  {
    startDate: "2026-05-14",
    endDate: "2026-05-17",
    dayCount: 4,
    needBridgeDay: false,
    bridgeDays: [],
  },
  {
    startDate: "2026-05-23",
    endDate: "2026-05-25",
    dayCount: 3,
    needBridgeDay: false,
    bridgeDays: [],
  },
];

// ---------------------------------------------------------------------------
// School holidays — Zuid-Nederland (NL-ZU) for 2026
// ---------------------------------------------------------------------------

export const seedSchoolHolidays: SchoolHoliday[] = [
  {
    id: "nl-zu-2026-voorjaarsvakantie",
    startDate: "2026-02-16",
    endDate: "2026-02-20",
    type: "SchoolHoliday",
    name: [
      { language: "EN", text: "Spring Holiday" },
      { language: "NL", text: "Voorjaarsvakantie" },
    ],
    regionalScope: "Local",
    temporalScope: "Recurring",
    nationwide: false,
    subdivisions: [{ code: "NL-ZU", shortName: "Zuid" }],
  },
  {
    id: "nl-zu-2026-meivakantie",
    startDate: "2026-04-27",
    endDate: "2026-05-08",
    type: "SchoolHoliday",
    name: [
      { language: "EN", text: "May Holiday" },
      { language: "NL", text: "Meivakantie" },
    ],
    regionalScope: "Local",
    temporalScope: "Recurring",
    nationwide: false,
    subdivisions: [{ code: "NL-ZU", shortName: "Zuid" }],
  },
  {
    id: "nl-zu-2026-zomervakantie",
    startDate: "2026-07-20",
    endDate: "2026-08-28",
    type: "SchoolHoliday",
    name: [
      { language: "EN", text: "Summer Holiday" },
      { language: "NL", text: "Zomervakantie" },
    ],
    regionalScope: "Local",
    temporalScope: "Recurring",
    nationwide: false,
    subdivisions: [{ code: "NL-ZU", shortName: "Zuid" }],
  },
];

// ---------------------------------------------------------------------------
// Paydates for 2026
// ---------------------------------------------------------------------------

export const seedPaydates: string[] = [
  "2026-01-25",
  "2026-02-25",
  "2026-03-25",
  "2026-04-24",
  "2026-05-25",
  "2026-06-25",
  "2026-07-25",
  "2026-08-25",
  "2026-09-25",
  "2026-10-25",
  "2026-11-25",
  "2026-12-24",
];
