import { describe, expect, it } from "vitest";
import { percent, resolveLabelColors } from "@/features/timeTracking/cssVars";
import { getDefaultLabelColor } from "@/lib/timeTracking/constants";

describe("timeTracking css variable helpers", () => {
  it("passes a valid hex label colour through with a readable foreground", () => {
    expect(resolveLabelColors("#ffffff")).toEqual({ background: "#ffffff", foreground: "#000" });
    expect(resolveLabelColors("#102030")).toEqual({ background: "#102030", foreground: "#fff" });
  });

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
