import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SettingsProvider, useSettings, normalizeAppearance } from "@/contexts/SettingsContext";
import { DEVICE_PREFERENCES_STORAGE_KEY, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

afterEach(() => localStorage.clear());

it("migrates missing and invalid appearance fields conservatively", () => {
  for (const value of [null, {}, { fontScale: "huge", highContrast: "true" }]) {
    expect(normalizeAppearance(value)).toEqual({ fontScale: "normal", highContrast: false });
  }
  expect(normalizeAppearance({ fontScale: "larger", highContrast: true })).toEqual({
    fontScale: "larger",
    highContrast: true,
  });
});

it("persists appearance on this device without changing account state and restores it", () => {
  localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ myTeam: 2 }));
  localStorage.setItem(DEVICE_PREFERENCES_STORAGE_KEY, JSON.stringify({ lastHdayTeamId: "team" }));
  const account = localStorage.getItem(USER_STATE_STORAGE_KEY);
  const { result, unmount } = renderHook(useSettings, { wrapper: SettingsProvider });
  act(() => result.current.updateFontScale("large"));
  act(() => result.current.updateHighContrast(true));
  expect(result.current.appearance).toEqual({ fontScale: "large", highContrast: true });
  expect(localStorage.getItem(USER_STATE_STORAGE_KEY)).toBe(account);
  expect(JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY)!)).toEqual({
    lastHdayTeamId: "team",
    appearance: { fontScale: "large", highContrast: true },
  });
  unmount();
  const restored = renderHook(useSettings, { wrapper: SettingsProvider });
  expect(restored.result.current.appearance).toEqual({ fontScale: "large", highContrast: true });
  act(() => restored.result.current.resetSettings());
  expect(restored.result.current.appearance).toEqual({ fontScale: "normal", highContrast: false });
});
