import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { MonthCalendar } from "../MonthCalendar";

const TestProviders = ({ children }: { children: React.ReactNode }) => {
  return <React.StrictMode>{children}</React.StrictMode>;
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: TestProviders });
};

describe("MonthCalendar integration", () => {
  it("renders calendar with events and public holidays without crashing", () => {
    const events = [
      {
        type: "event",
        date: dayjs("2024-01-10"),
        title: "Test Event",
      },
    ] as any;

    const publicHolidays = new Map([
      ["2024-01-10", { name: "Public Holiday" } as any],
    ]);

    expect(() => {
      renderWithProviders(
        <MonthCalendar
          events={events}
          month={dayjs("2024-01-01")}
          publicHolidays={publicHolidays}
          onMonthChange={() => {}}
          onAddEvent={() => {}}
          onViewEvent={() => {}}
          onEditEvent={() => {}}
        />
      );
    }).not.toThrow();
  });
});
