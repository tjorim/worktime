import { describe, expect, it } from "vitest";
import { percent, resolveLabelColors } from "@/features/timeTracking/cssVars";
import { getDefaultLabelColor } from "@/lib/timeTracking/constants";

describe("timeTracking css variable helpers", () => {
  it("passes a valid hex label colour through with a readable foreground", () => {
    expect(resolveLabelColors("#ffffff")).toEqual({ background: "#ffffff", foreground: "#000" });
    expect(resolveLabelColors("#102030")).toEqual({ background: "#102030", foreground: "#fff" });
  });

  it.each(["#f97316", "#22c55e", "#3b82f6"])(
    "uses the foreground with the higher WCAG contrast on mid-tone %s",
    (background) => {
      const { foreground } = resolveLabelColors(background);
      const lum = (hex: string) => {
        const full = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
        const [r, g, b] = [0, 2, 4].map((i) => {
          const v = Number.parseInt(full.slice(i, i + 2), 16) / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
        return (hi + 0.05) / (lo + 0.05);
      };
      const other = foreground === "#000" ? "#fff" : "#000";
      expect(ratio(background, foreground)).toBeGreaterThanOrEqual(ratio(background, other));
      expect(ratio(background, foreground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([undefined, "", "red", "url(javascript:alert(1))", "#12345", "#12345g"])(
    "falls back to the default label colour for %j",
    (value) => {
      expect(resolveLabelColors(value).background).toBe(getDefaultLabelColor());
    },
  );

  it("clamps percentages and rejects non-finite values", () => {
    expect(percent(37.5)).toBe("37.5%");
    expect(percent(-5)).toBe("0%");
    expect(percent(250)).toBe("100%");
    expect(percent(Number.NaN)).toBe("0%");
    expect(percent(Number.POSITIVE_INFINITY)).toBe("0%");
  });
});
