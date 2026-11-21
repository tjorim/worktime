import { createRoot } from "react-dom/client";
import { useState } from "react";
import "@/styles/tailwind.css";
import { MonthCalendar } from "@/features/calendar/month/MonthCalendar";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { setLocale } from "@/paraglide/runtime.js";
import type { TimeOffEntry } from "@/lib/time-off/types";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
setLocale(params.get("lang") === "nl" ? "nl" : "en", { reload: false });
const noop = () => undefined;
const entries: TimeOffEntry[] = [
  {
    id: "a",
    entryKind: "date",
    date: "2026-11-11",
    entryType: "vacation",
    entryFlag: "full_day",
    note: "Autumn break",
  } as TimeOffEntry,
];

function Fixture() {
  const [month, setMonth] = useState(dayjs("2026-11-01"));
  return (
    <div className="mx-auto max-w-5xl p-4">
      <MonthCalendar
        entries={entries}
        month={month}
        onMonthChange={setMonth}
        onAddEvent={noop}
        onViewEvent={noop}
        onEditEvent={noop}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
