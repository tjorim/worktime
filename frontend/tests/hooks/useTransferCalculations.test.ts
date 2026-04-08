import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React, { type ReactNode } from "react";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { useTransferCalculations } from "@/hooks/useTransferCalculations";

const wrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(SettingsProvider, null, children);

// All tests use myTeam/otherTeam naming to match the updated API

describe("useTransferCalculations", () => {
  describe("Initial state and team management", () => {
    it("initializes with correct default values", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: 1 }), { wrapper });
      expect(result.current.availableOtherTeams).toEqual([2, 3, 4, 5]);
      expect(result.current.otherTeam).toBe(2); // First available team
      expect(Array.isArray(result.current.transfers)).toBe(true);
    });

    it("excludes my team from available teams", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: 3 }), { wrapper });
      expect(result.current.availableOtherTeams).toEqual([1, 2, 4, 5]);
      expect(result.current.otherTeam).toBe(1); // First available team
    });

    it("handles null my team", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: null }), { wrapper });
      expect(result.current.availableOtherTeams).toEqual([1, 2, 3, 4, 5]);
      expect(result.current.transfers).toEqual([]);
    });

    it("accepts initial custom date props and allows setting other team", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            customStartDate: "2025-01-01",
            customEndDate: "2025-01-31",
          }),
        { wrapper },
      );
      act(() => {
        result.current.setOtherTeam(3);
      });
      expect(result.current.otherTeam).toBe(3);
    });
  });

  describe("State management", () => {
    it("updates other team", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: 1 }), { wrapper });
      act(() => {
        result.current.setOtherTeam(4);
      });
      expect(result.current.otherTeam).toBe(4);
    });
  });

  describe("Transfer calculations", () => {
    it("returns empty transfers when no my team", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: null }), { wrapper });
      expect(result.current.transfers).toEqual([]);
    });

    it("calculates transfers for valid teams and custom date range", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            customStartDate: "2025-01-01",
            customEndDate: "2025-01-02",
          }),
        { wrapper },
      );
      act(() => {
        result.current.setOtherTeam(2);
      });
      expect(result.current.transfers).toBeDefined();
      expect(Array.isArray(result.current.transfers)).toBe(true);
    });

    it("limits transfers to 20 maximum", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            customStartDate: "2025-01-01",
            customEndDate: "2025-12-31",
            limit: 20,
          }),
        { wrapper },
      );
      act(() => {
        result.current.setOtherTeam(2);
      });
      expect(result.current.transfers.length).toBeLessThanOrEqual(20);
    });
  });

  describe("Team updates and effects", () => {
    it("updates other team when my team changes and other team becomes unavailable", () => {
      const { result, rerender } = renderHook(({ myTeam }) => useTransferCalculations({ myTeam }), {
        initialProps: { myTeam: 1 },
        wrapper,
      });
      act(() => {
        result.current.setOtherTeam(3);
      });
      expect(result.current.otherTeam).toBe(3);
      // Change my team to 3, making other team 3 unavailable
      rerender({ myTeam: 3 });
      expect(result.current.otherTeam).toBe(1); // Should switch to first available
    });

    it("maintains other team when it remains available after my team change", () => {
      const { result, rerender } = renderHook(({ myTeam }) => useTransferCalculations({ myTeam }), {
        initialProps: { myTeam: 1 },
        wrapper,
      });
      act(() => {
        result.current.setOtherTeam(4);
      });
      expect(result.current.otherTeam).toBe(4);
      // Change my team to 2, other team 4 should still be available
      rerender({ myTeam: 2 });
      expect(result.current.otherTeam).toBe(4); // Should remain the same
    });
  });

  describe("Transfer info structure", () => {
    it("returns transfers with correct structure", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            customStartDate: "2025-01-01",
            customEndDate: "2025-01-07",
          }),
        { wrapper },
      );
      act(() => {
        result.current.setOtherTeam(2);
      });
      expect(Array.isArray(result.current.transfers)).toBe(true);
      result.current.transfers.forEach((transfer) => {
        expect(transfer).toHaveProperty("date");
        expect(transfer).toHaveProperty("fromTeam");
        expect(transfer).toHaveProperty("toTeam");
        expect(transfer).toHaveProperty("fromShiftType");
        expect(transfer).toHaveProperty("toShiftType");
        expect(transfer).toHaveProperty("type");
      });
    });
  });
});
