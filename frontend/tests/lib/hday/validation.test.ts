import { describe, expect, it } from "vitest";
import { isValidDate, parseHdayDate } from "../../../src/lib/hday/validation";

describe("hday validation", () => {
  it("accepts only real YYYY/MM/DD calendar dates", () => {
    expect(isValidDate("2026/03/11")).toBe(true);
    expect(isValidDate("2026/02/29")).toBe(false);
    expect(isValidDate("2024/02/29")).toBe(true);
    expect(isValidDate("2026-03-11")).toBe(false);
    expect(isValidDate("26/03/11")).toBe(false);
  });

  it("parses valid dates and rejects invalid ones", () => {
    const parsed = parseHdayDate("2026/03/11");

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(11);
    expect(parseHdayDate("2026/02/30")).toBeNull();
    expect(parseHdayDate("invalid")).toBeNull();
  });
});
