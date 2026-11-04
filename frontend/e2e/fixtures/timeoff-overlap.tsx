import { buildPreviewLine } from "@/lib/hday/serializer";
import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import "@/styles/tailwind.css";
import { EventModal } from "@/components/EventModal";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { TimeOffTableView } from "@/components/timeOff/TimeOffTableView";
import { ToastProvider } from "@/contexts/ToastContext";
import { useEventForm } from "@/hooks/useEventForm";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  getTypeFlagOptions,
  getTimeLocationFlagOptions,
  TYPE_FLAGS_AS_EVENT_FLAGS,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
} from "@/data/timeoffConstants";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { setLocale } from "@/paraglide/runtime.js";
const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
setLocale(params.get("lang") === "nl" ? "nl" : "en", { reload: false });
const entries: TimeOffEntry[] = [
  {
    id: "a",
    entryKind: "range",
    start: "2026-11-09",
    end: "2026-11-13",
    entryType: "vacation",
    entryFlag: "full_day",
    note: "Autumn break",
  },
  {
    id: "b",
    entryKind: "range",
    start: "2026-11-11",
    end: "2026-11-20",
    entryType: "ill",
    entryFlag: "full_day",
    note: "Sick leave",
  },
  {
    id: "c",
    entryKind: "weekly",
    weekday: 3,
    entryType: "other",
    entryFlag: "half_am",
    note: "Weekly appointment",
  },
];
const noop = () => {};
function Fixture() {
  const form = useEventForm();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const mode = params.get("mode") ?? "add";
  if (mode === "table")
    return (
      <ToastProvider>
        <TimeOffTableView
          entries={entries}
          eventCount={3}
          selectedCount={0}
          selectedIds={new Set()}
          viewMode="table"
          onClearSelection={noop}
          onBulkDelete={noop}
          onImport={noop}
          onExport={noop}
          isPullingFromHelper={false}
          isPushingToHelper={false}
          onAddEvent={noop}
          onToggleSelection={noop}
          onEditEvent={noop}
          onDeleteEvent={noop}
          onSetSelection={noop}
          rawEditorText=""
          isRawEditorDirty={false}
          onChangeRawEditorText={noop}
          onApplyRawEditor={noop}
          onResetRawEditor={noop}
        />
      </ToastProvider>
    );
  if (mode === "calendar")
    return (
      <MonthCalendar
        entries={entries}
        month={dayjs("2026-11-01")}
        onMonthChange={noop}
        onAddEvent={noop}
        onViewEvent={noop}
        onEditEvent={noop}
      />
    );
  return (
    <EventModal
      {...form}
      show={open}
      mode={mode === "edit" ? "edit" : mode === "view" ? "view" : "add"}
      entries={entries}
      editEntryId={mode === "edit" || mode === "view" ? "b" : null}
      formRef={ref}
      previewLine={buildPreviewLine({
        eventType: form.eventType,
        start: form.eventStart,
        end: form.eventEnd,
        weekday: form.eventWeekday,
        title: form.eventTitle,
        flags: form.eventFlags,
      })}
      typeFlagOptions={getTypeFlagOptions()}
      timeLocationFlagOptions={getTimeLocationFlagOptions()}
      typeFlagsAsEventFlags={TYPE_FLAGS_AS_EVENT_FLAGS}
      timeLocationFlagsAsEventFlags={TIME_LOCATION_FLAGS_AS_EVENT_FLAGS}
      onHide={() => setOpen(false)}
      onEntered={() => {
        if (mode === "edit" || mode === "view") form.prefillFormFromEntry(entries[1]!);
      }}
      onEventTypeChange={form.setEventType}
      onEventTitleChange={form.setEventTitle}
      onEventWeekdayChange={form.setEventWeekday}
      onStartDateChange={form.setEventStart}
      onEndDateChange={form.setEventEnd}
      onTypeFlagChange={form.handleTypeFlagChange}
      onTimeFlagChange={form.handleTimeFlagChange}
      onResetForm={form.resetForm}
      onSubmit={() => setOpen(false)}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
