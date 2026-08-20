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

  describe("Teamless shift-type lookups", () => {
    it("resolves overlaps by shift type on the other side without needing a team number", () => {
      // Own team 1 on the default (5-shift) schedule works Morning 07:00-15:00
      // on 2025-07-16; asking for "9-5"'s Day shift (09:00-17:00) that same
      // Wednesday should overlap 09:00-15:00, same as picking team 1 directly —
      // but here no otherTeam is selected at all.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherScheduleType: "9-5",
            otherShiftType: "D",
            customStartDate: "2025-07-16",
            customEndDate: "2025-07-16",
          }),
        { wrapper },
      );

      expect(result.current.overlaps).toHaveLength(1);
      expect(result.current.overlaps[0]?.start.format("HH:mm")).toBe("09:00");
      expect(result.current.overlaps[0]?.end.format("HH:mm")).toBe("15:00");
    });

    it("resolves overlaps by shift type on the user's own side even without a team", () => {
      // No myTeam at all — matched purely by "which team is on Morning today"
      // on the user's own (default 5-shift) schedule.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: null,
            myShiftType: "M",
            otherScheduleType: "9-5",
            otherShiftType: "D",
            customStartDate: "2025-07-16",
            customEndDate: "2025-07-16",
          }),
        { wrapper },
      );

      expect(result.current.overlaps).toHaveLength(1);
      expect(result.current.overlaps[0]?.start.format("HH:mm")).toBe("09:00");
      expect(result.current.overlaps[0]?.end.format("HH:mm")).toBe("15:00");
    });

    it("resolves to a different team as the schedule rotates across the scan range", () => {
      // 2-shift alternates each team between Morning/Evening by week. Looking
      // for "whoever is on Morning" across two weeks should follow the
      // rotation rather than sticking to one team.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherScheduleType: "2-shift",
            otherShiftType: "M",
            customStartDate: "2025-07-14",
            customEndDate: "2025-07-21",
          }),
        { wrapper },
      );

      // Both weeks produce a Monday-Friday Morning window for whichever team
      // is on it that week — at least two overlaps found across the range
      // confirms the resolver kept following the rotation rather than
      // reporting nothing once the original team rotated off Morning.
      expect(result.current.overlaps.length).toBeGreaterThanOrEqual(2);
    });

    it("returns no transfers in teamless mode even on the same schedule", () => {
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: 1,
            otherShiftType: "M",
            customStartDate: "2025-07-01",
            customEndDate: "2025-07-31",
          }),
        { wrapper },
      );

      expect(result.current.transfers).toEqual([]);
    });

    it("computes overlaps with no team selected on either side", () => {
      // The clearest proof of the bypass: myTeam is null and no otherTeam is
      // ever set — both sides are resolved purely from shift type.
      const { result } = renderHook(
        () =>
          useTransferCalculations({
            myTeam: null,
            myShiftType: "M",
            otherScheduleType: "9-5",
            otherShiftType: "D",
            customStartDate: "2025-07-16",
            customEndDate: "2025-07-16",
          }),
        { wrapper },
      );

      expect(result.current.validatedMyTeam).toBeNull();
      expect(result.current.overlaps).toHaveLength(1);
    });
  });
});
