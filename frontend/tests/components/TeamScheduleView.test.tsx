import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { delay, http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamScheduleView } from "@/components/TeamScheduleView";
import { useHdayHelper } from "@/contexts/HdayHelperContext";
import { server } from "@/mocks/server";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "@/constants/storageKeys";
import * as m from "@/paraglide/messages.js";
import { TestProviders } from "@tests/utils/testProviders";
import { dayjs } from "@/utils/dateTimeUtils";

const HELPER_URL = "http://localhost:8080";
const OTHER_HELPER_URL = "http://localhost:9090";

// Test-only harness for driving updateHdayHelperUrl() from outside SettingsHdayHelper,
// sharing the same HdayHelperContext instance as the rendered TeamScheduleView.
function HelperUrlSwitcher({ url }: { url: string }) {
  const { updateHdayHelperUrl } = useHdayHelper();
  return (
    <button type="button" onClick={() => updateHdayHelperUrl(url)}>
      switch helper
    </button>
  );
}

function seedHelperUrl(hdayHelperUrl: string | null) {
  window.localStorage.setItem(
    DEVICE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ hdayHelper: { url: hdayHelperUrl }, lastHdayTeamId: "eng" }),
  );
}

function teamHdayPayload(teamId: string, name = "Engineering") {
  return {
    team_id: teamId,
    name,
    sections: [
      {
        title: null,
        members: [{ username: "alice", display_name: "Alice", raw: "", events: [], etag: null }],
      },
    ],
    members: [{ username: "alice", display_name: "Alice", raw: "", events: [], etag: null }],
  };
}

describe("TeamScheduleView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("guards direct rendering when no helper is configured", () => {
    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(screen.getByText(m.team_helper_required_heading())).toBeInTheDocument();
    expect(screen.queryByText(m.team_backend_required_heading())).not.toBeInTheDocument();
  });

  it("requires a configured helper and never falls back to the app's own origin", async () => {
    seedHelperUrl(null);
    // No handler for */api/team/*hday is registered — MSW's onUnhandledRequest: "error"
    // means the test fails loudly if the view ever attempts that request.

    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText(m.team_helper_required_heading())).toBeInTheDocument();
    expect(screen.queryByLabelText(m.team_id_label())).not.toBeInTheDocument();
  });

  it("routes to the configured helper without checking backend connection status", async () => {
    seedHelperUrl(HELPER_URL);
    server.use(
      http.get(`${HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string)),
      ),
    );

    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText("Engineering")).toBeInTheDocument();
    expect(screen.queryByText(m.team_helper_required_heading())).not.toBeInTheDocument();
  });

  it("clears stale data and refetches when the configured helper changes", async () => {
    seedHelperUrl(HELPER_URL);
    server.use(
      http.get(`${HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string, "Team from helper A")),
      ),
      http.get(`${OTHER_HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string, "Team from helper B")),
      ),
    );

    const user = userEvent.setup();
    render(
      <TestProviders>
        <HelperUrlSwitcher url={OTHER_HELPER_URL} />
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText("Team from helper A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "switch helper" }));

    expect(await screen.findByText("Team from helper B")).toBeInTheDocument();
    expect(screen.queryByText("Team from helper A")).not.toBeInTheDocument();
  });

  it("refetches from a new helper while the previous helper is still loading", async () => {
    seedHelperUrl(HELPER_URL);
    server.use(
      http.get(`${HELPER_URL}/team/:teamId/hday`, async () => {
        await delay("infinite");
        return HttpResponse.json(teamHdayPayload("eng", "Never shown"));
      }),
      http.get(`${OTHER_HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string, "Team from helper B")),
      ),
    );

    const user = userEvent.setup();
    render(
      <TestProviders>
        <HelperUrlSwitcher url={OTHER_HELPER_URL} />
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText(m.loading())).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch helper" }));

    expect(await screen.findByText("Team from helper B")).toBeInTheDocument();
  });

  describe("grid rendering", () => {
    const today = dayjs();
    const isoSlash = (d: dayjs.Dayjs) => d.format("YYYY/MM/DD");

    function payloadWithEvents(events: unknown[]) {
      const member = {
        username: "alice",
        display_name: "Alice",
        raw: "",
        events,
        etag: "x",
      };
      return {
        team_id: "eng",
        name: "Engineering",
        sections: [{ title: null, members: [member] }],
        members: [member],
      };
    }

    async function renderGrid(events: unknown[]) {
      seedHelperUrl(HELPER_URL);
      server.use(
        http.get(`${HELPER_URL}/team/:teamId/hday`, () =>
          HttpResponse.json(payloadWithEvents(events)),
        ),
      );
      render(
        <TestProviders>
          <TeamScheduleView />
        </TestProviders>,
      );
      await screen.findByText("Engineering");
      return document.querySelector("[data-team-grid]") as HTMLElement;
    }

    const cellFor = (grid: HTMLElement, d: dayjs.Dayjs) =>
      grid.querySelector<HTMLElement>(
        `tbody tr[data-team-member] td[data-date="${d.format("YYYY-MM-DD")}"]`,
      )!;

    it("marks today's column header so it can be scrolled into view", async () => {
      const grid = await renderGrid([]);
      const marked = grid.querySelectorAll('th[aria-current="date"]');
      expect(marked).toHaveLength(1);
      expect(marked[0]).toHaveTextContent(today.format("D"));
    });

    it("draws one stripe per event when several fall on the same day", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        { type: "range", start: day, end: day, flags: [], title: "Holiday" },
        { type: "range", start: day, end: day, flags: ["ill"], title: "Sick" },
      ]);

      const cell = cellFor(grid, today);
      const segments = cell.querySelectorAll("[data-team-event-segment]");
      expect(segments).toHaveLength(2);
      expect(segments[0]).toHaveClass("bg-wt-event-holiday-full-bg");
      expect(segments[1]).toHaveClass("bg-wt-event-ill-full-bg");
      // Screen readers get every event, not just the first.
      expect(cell).toHaveAttribute("aria-label", expect.stringContaining("Holiday"));
      expect(cell).toHaveAttribute("aria-label", expect.stringContaining("Sick"));
    });

    it("colors a half day in the full color with a glyph and a split fill", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        { type: "range", start: day, end: day, flags: ["half_am"], title: "Dentist" },
      ]);

      const cell = cellFor(grid, today);
      // Full color (the fill is split by CSS), not the lighter "-half" color.
      expect(cell).toHaveClass("bg-wt-event-holiday-full-bg", "team-half-am");
      expect(cell).not.toHaveClass("bg-wt-event-holiday-half-bg");
      expect(cell.querySelector("[data-team-event-stack]")).toBeNull();
      expect(cell).toHaveTextContent("◐");
    });

    it("uses ◑ and the right half for the afternoon", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        { type: "range", start: day, end: day, flags: ["half_pm"], title: "School run" },
      ]);

      const cell = cellFor(grid, today);
      expect(cell).toHaveClass("team-half-pm");
      expect(cell).toHaveTextContent("◑");
    });

    it("caps the first and last day of a range and leaves the days between plain", async () => {
      const grid = await renderGrid([
        {
          type: "range",
          start: isoSlash(today.subtract(1, "day")),
          end: isoSlash(today.add(1, "day")),
          flags: [],
          title: "Trip",
        },
      ]);

      const first = cellFor(grid, today.subtract(1, "day"));
      const middle = cellFor(grid, today);
      const last = cellFor(grid, today.add(1, "day"));
      expect(first).toHaveClass("team-range-start");
      expect(first).not.toHaveClass("team-range-end");
      expect(middle).not.toHaveClass("team-range-start");
      expect(middle).not.toHaveClass("team-range-end");
      expect(last).toHaveClass("team-range-end");
      expect(last).not.toHaveClass("team-range-start");
    });

    it("caps a one-day range at both ends", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([{ type: "range", start: day, end: day, flags: [] }]);

      const cell = cellFor(grid, today);
      expect(cell).toHaveClass("team-range-start", "team-range-end");
    });

    it("treats a range that continues past the visible edge as continuing", async () => {
      // Starts long before the grid's first day and ends long after its last.
      const grid = await renderGrid([
        {
          type: "range",
          start: isoSlash(today.subtract(6, "month")),
          end: isoSlash(today.add(6, "month")),
          flags: [],
        },
      ]);

      expect(
        grid.querySelectorAll('[class~="team-range-start"], [class~="team-range-end"]'),
      ).toHaveLength(0);
    });

    it("styles today's and weekend header cells through classes, not inline styles", async () => {
      const grid = await renderGrid([]);
      const todayHeader = grid.querySelector('th[aria-current="date"]') as HTMLElement;
      expect(todayHeader).toHaveClass("bg-team-today");
      expect(todayHeader).not.toHaveAttribute("style");
      // Any weekend day header (Sat/Sun) that isn't today carries is-weekend.
      expect(grid.querySelectorAll('th[class~="bg-team-header-weekend"]').length).toBeGreaterThan(
        0,
      );
    });

    it("shows a legend entry for every look the grid can produce", async () => {
      await renderGrid([]);
      for (const label of [
        m.team_legend_available(),
        m.team_legend_weekend(),
        m.team_legend_vacation(),
        m.team_legend_sick(),
        m.team_legend_business(),
        m.team_legend_training(),
        m.team_legend_weekly_off(),
        m.team_legend_birthday(),
        m.team_legend_in_office(),
        m.team_legend_other(),
        m.team_legend_weekend_event(),
        m.team_legend_half_am(),
        m.team_legend_half_pm(),
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("renders legend swatches with the same classes the grid cells use", async () => {
      await renderGrid([]);
      const swatches = document.querySelectorAll("[data-team-swatch]");
      const classes = Array.from(swatches).map((el) => el.className);
      expect(classes.some((c) => c.includes("bg-wt-team-cal-available"))).toBe(true);
      expect(classes.some((c) => c.includes("bg-wt-team-cal-weekend-cell"))).toBe(true);
      expect(classes.some((c) => c.includes("event-other-full"))).toBe(true);
      expect(classes.some((c) => c.includes("team-half-am"))).toBe(true);
    });

    it("scrolls today into view when the grid appears", async () => {
      const rect = (left: number, width: number) =>
        ({
          left,
          width,
          right: left + width,
          top: 0,
          bottom: 0,
          height: 0,
          x: left,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
      ) {
        if (this.matches('th[aria-current="date"]')) return rect(2000, 28);
        if (this.matches("[data-team-name]")) return rect(0, 200);
        if (this.classList.contains("overflow-x-auto")) return rect(0, 1000);
        return rect(0, 0);
      });
      try {
        await renderGrid([]);
        const scroller = document.querySelector('[class~="overflow-x-auto"]') as HTMLElement;
        // 2000 - 200 (sticky) - (800 - 28) / 2 = 1414
        await waitFor(() => expect(scroller.scrollLeft).toBe(1414));
      } finally {
        spy.mockRestore();
      }
    });

    it("makes event cells focusable with a descriptive aria-label, and leaves empty cells alone", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        {
          type: "range",
          start: day,
          end: day,
          flags: ["business", "half_pm"],
          title: "Client visit",
        },
      ]);

      const cell = cellFor(grid, today);
      expect(cell).toHaveAttribute("tabindex", "0");
      const label = cell.getAttribute("aria-label")!;
      expect(label).toContain("Alice");
      expect(label).toContain(m.team_legend_business());
      expect(label).toContain(m.team_legend_half_pm());
      expect(label).toContain("Client visit");

      const empty = cellFor(grid, today.add(3, "day"));
      expect(empty).not.toHaveAttribute("tabindex");
      expect(empty).not.toHaveAttribute("aria-label");
    });

    it("opens a popover with every event's type, half-day and title on focus", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        { type: "range", start: day, end: day, flags: [], title: "Ski trip" },
        { type: "range", start: day, end: day, flags: ["ill", "half_am"], title: "Cold" },
      ]);
      const user = userEvent.setup();

      await user.tab(); // reach the first focusable element…
      act(() => cellFor(grid, today).focus()); // …then land on the cell itself
      const popover = await screen.findByRole("tooltip");

      expect(popover).toHaveTextContent("Alice");
      expect(popover).toHaveTextContent(m.team_legend_vacation());
      expect(popover).toHaveTextContent("Ski trip");
      expect(popover).toHaveTextContent(m.team_legend_sick());
      expect(popover).toHaveTextContent(m.team_legend_half_am());
      expect(popover).toHaveTextContent("Cold");
      expect(cellFor(grid, today)).toHaveFocus();
      await user.tab();
      expect(cellFor(grid, today)).not.toHaveFocus();
      await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    });

    it("opens the same event details on hover and dismisses them with Escape", async () => {
      const day = isoSlash(today);
      const grid = await renderGrid([
        { type: "range", start: day, end: day, flags: ["business"], title: "Client visit" },
      ]);
      const user = userEvent.setup();
      const cell = cellFor(grid, today);
      await user.hover(cell);
      const popover = await screen.findByRole("tooltip");
      expect(popover).toHaveTextContent("Client visit");
      expect(popover).toHaveTextContent(m.team_legend_business());
      expect(cell).toHaveAttribute("aria-label", expect.stringContaining("Client visit"));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    });

    it("labels a weekly pattern as such", async () => {
      const grid = await renderGrid([
        { type: "weekly", weekday: today.isoWeekday(), flags: ["business"], title: "Standup" },
      ]);

      const label = cellFor(grid, today).getAttribute("aria-label")!;
      expect(label).toContain(m.team_legend_business());
      expect(label).toContain(m.team_popover_weekly());
    });

    it("keeps the team ID form and the grid in one card, so the grid isn't pushed down", async () => {
      const grid = await renderGrid([]);
      const card = grid.closest('[data-slot="card"]')!;
      // The form lives in this card's header, not in a separate card above it.
      expect(card.querySelector('[data-slot="card-header"] #team-id-input')).not.toBeNull();
      expect(
        document.querySelectorAll('[data-slot="team-schedule-view"] > [data-slot="card"]'),
      ).toHaveLength(2); // grid + legend
    });

    it("gives every month a sticky label and long names an ellipsis-ready wrapper", async () => {
      const grid = await renderGrid([]);
      expect(grid.querySelectorAll("[data-team-month-label]").length).toBeGreaterThan(0);
      expect(grid.querySelector("[data-team-member] [data-team-member-name]")).toHaveAttribute(
        "tabindex",
        "0",
      );
    });
  });
});
