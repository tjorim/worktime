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

  describe("Cross-schedule overlaps (#1111)", () => {
    it("defaults otherScheduleType to the user's own schedule", () => {
      const { result } = renderHook(() => useTransferCalculations({ myTeam: 1 }), { wrapper });
      // No scheduleType configured in this wrapper — both sides fall back the same way.
      expect(result.current.otherScheduleType).toBeNull();
    });

    it("reflects an explicit otherScheduleType", () => {
      const { result } = renderHook(
        () => useTransferCalculations({ myTeam: 1, otherScheduleType: "9-5" }),
        { wrapper },
      );
      expect(result.current.otherScheduleType).toBe("9-5");
    });

    it("does not exclude the user's own team number when the other schedule differs", () => {
      // Team numbers on different rosters are unrelated identities — team 1 on
      // "9-5" isn't "my" team just because I'm also team 1 on my own schedule.
      const { result } = renderHook(
        () => useTransferCalculations({ myTeam: 1, otherScheduleType: "9-5" }),
        { wrapper },
      );
      expect(result.current.availableOtherTeams).toEqual([1]);
    });

    it("computes real overlap windows between two different schedules", () => {
      // My team 1 on the (default, 5-shift) schedule works Morning 07:00-15:00
      // on 2025-07-16 (the 5-shift reference date); "9-5" team 1 works Day
      // 09:00-17:00 that same Wednesday. Overlap should be 09:00-15:00.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherScheduleType: "9-5",
            customStartDate: "2025-07-16",
            customEndDate: "2025-07-16",
          }),
        { wrapper },
      );

      expect(result.current.overlaps).toHaveLength(1);
      expect(result.current.overlaps[0]?.start.format("HH:mm")).toBe("09:00");
      expect(result.current.overlaps[0]?.end.format("HH:mm")).toBe("15:00");
    });

    it("finds an overlap spanning a midnight boundary", () => {
      // 5-shift Team 1 works Night on 2025-01-01: 23:00 -> 07:00 the next day.
      // 2-shift Team 1 works Morning on 2025-01-02: 06:30 -> 15:30. The two
      // windows overlap 06:30-07:00 on Jan 2nd, only found by comparing Jan
      // 1st's window against Jan 2nd's — the scan's adjacent-day comparison.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherScheduleType: "2-shift",
            customStartDate: "2025-01-01",
            customEndDate: "2025-01-02",
          }),
        { wrapper },
      );

      expect(result.current.overlaps).toHaveLength(1);
      expect(result.current.overlaps[0]?.start.format("YYYY-MM-DD HH:mm")).toBe(
        "2025-01-02 06:30",
      );
      expect(result.current.overlaps[0]?.end.format("YYYY-MM-DD HH:mm")).toBe("2025-01-02 07:00");
    });

    it("paginates overlaps identically regardless of limit (early-exit scan doesn't drop or reorder results)", () => {
      // Team 1 works Morning (5-shift, 2 of every 10 days) against "9-5"'s
      // fixed weekday Day shift, producing many overlapping days across six
      // months. A small limit forces the scan's early exit (see
      // useTransferCalculations); a large one effectively disables it. The
      // two must agree, proving the early exit doesn't drop or misorder
      // overlaps relative to an (almost) unbounded scan.
      const range = {
        customStartDate: "2025-01-01",
        customEndDate: "2025-06-30",
      };
      const { result: smallLimit } = renderHook(
        () =>
          useTransferCalculations({ myTeam: 1, otherScheduleType: "9-5", ...range, limit: 3 }),
        { wrapper },
      );
      const { result: largeLimit } = renderHook(
        () =>
          useTransferCalculations({ myTeam: 1, otherScheduleType: "9-5", ...range, limit: 1000 }),
        { wrapper },
      );

      // Sanity check: there must be more overlapping days than the small
      // limit for this to actually exercise the early exit.
      expect(largeLimit.current.overlaps.length).toBeGreaterThan(3);
      expect(largeLimit.current.hasMoreOverlaps).toBe(false);

      expect(smallLimit.current.overlaps).toHaveLength(3);
      expect(smallLimit.current.hasMoreOverlaps).toBe(true);
      expect(smallLimit.current.overlaps.map((o) => o.start.format() + o.end.format())).toEqual(
        largeLimit.current.overlaps.slice(0, 3).map((o) => o.start.format() + o.end.format()),
      );
    });

    it("does not compute handover/takeover transfers across different schedules", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherScheduleType: "9-5",
            customStartDate: "2025-07-01",
            customEndDate: "2025-07-31",
          }),
        { wrapper },
      );

      expect(result.current.transfers).toEqual([]);
    });
  });
});
