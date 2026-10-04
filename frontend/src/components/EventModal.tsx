import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { RefObject } from "react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Grid, GridItem } from "@/components/ui/grid";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { EventFlag, TimeLocationFlag, TypeFlag } from "@/lib/hday/types";
import { getEventTypeLabel } from "@/lib/hday/presentation";
import { getWeekdayName } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

type FlagRadioProps = {
  id: string;
  label: string;
  value: string;
};

/**
 * Render one labelled radio option inside a flag `RadioGroup`.
 *
 * @param id - DOM id for the radio, referenced by the label
 * @param label - Visible label text for the option
 * @param value - Value the group reports when this option is selected
 */
function FlagRadio({ id, label, value }: FlagRadioProps) {
  return (
    <Field orientation="horizontal">
      <RadioGroupItem id={id} value={value} />
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  );
}

/**
 * Get human-readable label for an event flag.
 * Used for displaying flags as badges in view mode.
 *
 * @param flag - The event flag key
 * @returns Human-readable label for the flag
 */
function getFlagLabel(flag: EventFlag): string {
  const labels: Record<string, () => string> = {
    business: m.timeoff_flag_business,
    course: m.timeoff_flag_course,
    in: m.timeoff_flag_in,
    weekend: m.timeoff_flag_weekend,
    birthday: m.timeoff_flag_birthday,
    holiday: m.timeoff_flag_holiday,
    ill: m.timeoff_flag_ill,
    other: m.timeoff_flag_other,
    half_am: m.timeoff_flag_half_am,
    half_pm: m.timeoff_flag_half_pm,
    onsite: m.timeoff_flag_onsite,
    no_fly: m.timeoff_flag_no_fly,
    can_fly: m.timeoff_flag_can_fly,
  };
  return labels[flag]?.() ?? flag;
}

/**
 * Props for the FlagSection component
 */
type FlagSectionProps<Flag extends EventFlag | "none"> = {
  mode: "add" | "edit" | "view";
  title: string;
  fieldsetTitle?: string;
  flagOptions: Array<[Flag, string]>;
  eventFlags: ReadonlyArray<EventFlag>;
  flagGroup: ReadonlyArray<EventFlag>;
  onFlagChange: (flag: Flag) => void;
};

/**
 * Reusable component for displaying flag sections in both edit and view modes.
 * In edit/add mode, displays radio buttons for all flag options.
 * In view mode, displays badges for active flags only.
 *
 * @param mode - Current modal mode ("add", "edit", or "view")
 * @param title - Section title (used in view mode as form label)
 * @param fieldsetTitle - Section title for fieldset (used in edit/add mode, defaults to title)
 * @param flagOptions - Array of [flag, label] tuples for all available options
 * @param eventFlags - Currently selected event flags
 * @param flagGroup - Array of flags that belong to this section
 * @param onFlagChange - Callback when a flag is changed
 */
function FlagSection<Flag extends EventFlag | "none">({
  mode,
  title,
  fieldsetTitle,
  flagOptions,
  eventFlags,
  flagGroup,
  onFlagChange,
}: FlagSectionProps<Flag>) {
  const legendId = useId();
  const groupName = title.toLowerCase().replace(/\s+/g, "-");

  if (mode !== "view") {
    // Edit/Add mode: Show all radio buttons
    const selected =
      flagOptions.find(
        ([flag]) => flag !== "none" && eventFlags.includes(flag as EventFlag),
      )?.[0] ?? "none";

    return (
      <GridItem span={12}>
        <div className="rounded-lg border border-border p-3">
          <div id={legendId} className="mb-2 text-sm font-medium">
            {fieldsetTitle || title}
          </div>
          <RadioGroup
            name={`${groupName}-flag`}
            aria-labelledby={legendId}
            value={selected}
            onValueChange={(value) => onFlagChange(value as Flag)}
            className="sm:grid-cols-2 lg:grid-cols-3"
          >
            {flagOptions.map(([flag, label]) => (
              <FlagRadio key={flag} id={`${groupName}-flag-${flag}`} label={label} value={flag} />
            ))}
          </RadioGroup>
        </div>
      </GridItem>
    );
  }

  // View mode: Show only active flags as badges
  return (
    <GridItem span={12}>
      <Field>
        <FieldTitle>{title}</FieldTitle>
        <div className="flex flex-wrap items-center gap-2">
          {eventFlags
            .filter((f) => flagGroup.includes(f))
            .map((flag) => (
              <Badge key={flag} variant="secondary">
                {getFlagLabel(flag)}
              </Badge>
            ))}
          {!eventFlags.some((f) => flagGroup.includes(f)) && (
            <span className="text-muted-foreground">{m.event_modal_none_label()}</span>
          )}
        </div>
      </Field>
    </GridItem>
  );
}

type EventModalProps = {
  show: boolean;
  mode?: "add" | "edit" | "view";
  formRef: RefObject<HTMLDivElement | null>;
  eventType: "range" | "weekly";
  eventWeekday: number;
  eventStart: string;
  eventEnd: string;
  eventTitle: string;
  eventFlags: ReadonlyArray<EventFlag>;
  startDateError: string;
  endDateError: string;
  previewLine: string;
  typeFlagOptions: Array<[TypeFlag | "none", string]>;
  timeLocationFlagOptions: Array<[TimeLocationFlag | "none", string]>;
  typeFlagsAsEventFlags: ReadonlyArray<EventFlag>;
  timeLocationFlagsAsEventFlags: ReadonlyArray<EventFlag>;
  onHide: () => void;
  onEntered: () => void;
  onEventTypeChange: (value: "range" | "weekly") => void;
  onEventTitleChange: (value: string) => void;
  onEventWeekdayChange: (value: number) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onTypeFlagChange: (flag: TypeFlag | "none") => void;
  onTimeFlagChange: (flag: TimeLocationFlag | "none") => void;
  onResetForm: () => void;
  onSubmit: () => void;
  onSwitchToEdit?: () => void;
  onCancelEditMode?: () => void;
};

/**
 * Render a controlled modal for creating or editing a calendar event.
 *
 * Displays a live preview, inputs for event type, title, date/weekday, and two sets of mutually
 * exclusive flags (type and time/location). Validation messages for start/end dates are surfaced
 * to assistive technologies via ARIA attributes.
 *
 * Accessibility Features:
 * - DialogHeader closeButton provides keyboard-accessible close (Escape key, X button)
 * - All form inputs have associated <FieldLabel> elements for screen readers
 * - Required fields marked with aria-required="true" and visual * indicator
 * - Form validation errors use aria-describedby to link error messages to inputs
 * - Live preview section provides immediate feedback on event formatting
 * - Flag radios are Base UI radio groups with proper label associations
 * - Semantic HTML structure with proper heading hierarchy
 * - Focus trap built into the Base UI dialog
 * - Modal backdrop click and Escape key both trigger onHide for flexibility
 *
 * @param show - Whether the modal is visible
 * @param mode - Modal mode: `"add"` for new events, `"edit"` for editing, `"view"` for read-only viewing
 * @param formRef - Ref attached to the modal body for focus management
 * @param eventType - `"range"` for dated entries or `"weekly"` for recurring weekly entries
 * @param eventWeekday - ISO weekday (1-7) used for weekly recurring entries
 * @param eventStart - Start date string in `YYYY/MM/DD` format
 * @param eventEnd - Optional end date string in `YYYY/MM/DD` format
 * @param eventTitle - Optional comment/title for the event
 * @param eventFlags - List of currently selected event flags
 * @param startDateError - Validation message for the start date, if any
 * @param endDateError - Validation message for the end date, if any
 * @param previewLine - Generated raw `.hday` line to display in the preview
 * @param typeFlagOptions - Pairs of type-flag key and label for the type flags fieldset
 * @param timeLocationFlagOptions - Pairs of time/location-flag key and label for that fieldset
 * @param typeFlagsAsEventFlags - Mapping of type-flag keys to event flag values
 * @param timeLocationFlagsAsEventFlags - Mapping of time/location-flag keys to event flag values
 * @param onHide - Called when the modal requests to be closed (backdrop click, Escape, or close button)
 * @param onEntered - Called after the modal has finished opening
 * @param onEventTypeChange - Handler for changes to the event type selector
 * @param onEventTitleChange - Handler for the event title input
 * @param onEventWeekdayChange - Handler for changes to the weekday selector
 * @param onStartDateChange - Handler for the start date input (receives `YYYY/MM/DD` or empty string)
 * @param onEndDateChange - Handler for the end date input (receives `YYYY/MM/DD` or empty string)
 * @param onTypeFlagChange - Handler invoked with a type-flag key when a type flag is selected
 * @param onTimeFlagChange - Handler invoked with a time/location-flag key when selected
 * @param onResetForm - Resets the form to its initial state
 * @param onSubmit - Submits the form to add or update the event
 * @param onSwitchToEdit - Optional callback when Edit button is clicked in view mode to switch to edit mode
 * @param onCancelEditMode - Optional callback used in edit mode to return to view mode without closing the modal
 * @returns The rendered EventModal component (a dialog containing the editor)
 */
export function EventModal({
  show,
  mode = "add",
  formRef,
  eventType,
  eventWeekday,
  eventStart,
  eventEnd,
  eventTitle,
  eventFlags,
  startDateError,
  endDateError,
  previewLine,
  typeFlagOptions,
  timeLocationFlagOptions,
  typeFlagsAsEventFlags,
  timeLocationFlagsAsEventFlags,
  onHide,
  onEntered,
  onEventTypeChange,
  onEventTitleChange,
  onEventWeekdayChange,
  onStartDateChange,
  onEndDateChange,
  onTypeFlagChange,
  onTimeFlagChange,
  onResetForm,
  onSubmit,
  onSwitchToEdit,
  onCancelEditMode,
}: EventModalProps) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
      onOpenChangeComplete={(open) => {
        if (open) onEntered();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "view"
              ? m.event_modal_view_event()
              : mode === "edit"
                ? m.event_modal_edit_event()
                : m.event_modal_new_event()}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4" ref={formRef} tabIndex={-1}>
          <form onSubmit={(event) => event.preventDefault()}>
            <Grid>
              {mode !== "view" && (
                <GridItem span={12}>
                  <Card className="bg-muted py-2 ring-0">
                    <CardContent>
                      <div className="text-xs text-muted-foreground uppercase">
                        {m.event_modal_preview_label()}
                      </div>
                      <div className="font-semibold">
                        {getEventTypeLabel(eventFlags)}{" "}
                        {eventType === "weekly"
                          ? eventWeekday
                            ? "· " + getWeekdayName(eventWeekday)
                            : ""
                          : eventStart
                            ? eventEnd && eventEnd !== eventStart
                              ? "· " + eventStart + " → " + eventEnd
                              : "· " + eventStart
                            : m.event_modal_select_date()}
                      </div>
                      {eventTitle && <div className="text-muted-foreground">{eventTitle}</div>}
                      {eventFlags.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          {m.event_modal_flags_label({
                            flags: eventFlags.map((flag) => getFlagLabel(flag)).join(", "),
                          })}
                        </div>
                      )}
                      <div className="mt-2">
                        <div className="text-xs text-muted-foreground uppercase">
                          {m.event_modal_raw_line_label()}
                        </div>
                        <div className="font-mono">
                          {previewLine || m.event_modal_fill_required()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </GridItem>
              )}
              <GridItem span={12} desktopSpan={6}>
                <Field>
                  <FieldLabel htmlFor="eventType">{m.event_modal_event_type_label()}</FieldLabel>
                  <NativeSelect
                    id="eventType"
                    className="w-full"
                    value={eventType}
                    onChange={(event) =>
                      onEventTypeChange(event.target.value as "range" | "weekly")
                    }
                    disabled={mode === "view"}
                  >
                    <option value="range">{m.event_modal_type_range()}</option>
                    <option value="weekly">{m.event_modal_type_weekly()}</option>
                  </NativeSelect>
                </Field>
              </GridItem>

              <GridItem span={12} desktopSpan={6}>
                <Field>
                  <FieldLabel htmlFor="eventTitle">{m.event_modal_comment_label()}</FieldLabel>
                  <Input
                    id="eventTitle"
                    value={eventTitle}
                    onChange={(event) => onEventTitleChange(event.target.value)}
                    placeholder={m.event_modal_comment_placeholder()}
                    disabled={mode === "view"}
                  />
                </Field>
              </GridItem>

              {eventType === "range" ? (
                <>
                  <GridItem span={12} desktopSpan={6}>
                    <Field data-invalid={!!startDateError}>
                      <FieldLabel htmlFor="eventStart">
                        {m.event_modal_start_label()} <span className="text-danger-text">*</span>
                      </FieldLabel>
                      <Input
                        id="eventStart"
                        type="date"
                        value={eventStart ? eventStart.replace(/\//g, "-") : ""}
                        onChange={(event) =>
                          onStartDateChange(
                            event.target.value ? event.target.value.replace(/-/g, "/") : "",
                          )
                        }
                        aria-invalid={!!startDateError}
                        aria-required="true"
                        aria-describedby={startDateError ? "eventStart-error" : undefined}
                        disabled={mode === "view"}
                      />
                      {startDateError && (
                        <FieldError id="eventStart-error">{startDateError}</FieldError>
                      )}
                    </Field>
                  </GridItem>
                  <GridItem span={12} desktopSpan={6}>
                    <Field data-invalid={!!endDateError}>
                      <FieldLabel htmlFor="eventEnd">{m.event_modal_end_label()}</FieldLabel>
                      <Input
                        id="eventEnd"
                        type="date"
                        value={eventEnd ? eventEnd.replace(/\//g, "-") : ""}
                        onChange={(event) =>
                          onEndDateChange(
                            event.target.value ? event.target.value.replace(/-/g, "/") : "",
                          )
                        }
                        aria-invalid={!!endDateError}
                        aria-describedby={endDateError ? "eventEnd-error" : undefined}
                        disabled={mode === "view"}
                      />
                      {endDateError && <FieldError id="eventEnd-error">{endDateError}</FieldError>}
                    </Field>
                  </GridItem>
                </>
              ) : (
                <GridItem span={12} desktopSpan={6}>
                  <Field>
                    <FieldLabel htmlFor="eventWeekday">{m.event_modal_weekday_label()}</FieldLabel>
                    <NativeSelect
                      id="eventWeekday"
                      className="w-full"
                      value={String(eventWeekday)}
                      onChange={(event) => onEventWeekdayChange(Number(event.target.value))}
                      disabled={mode === "view"}
                    >
                      <option value="1">{m.weekday_mon()}</option>
                      <option value="2">{m.weekday_tue()}</option>
                      <option value="3">{m.weekday_wed()}</option>
                      <option value="4">{m.weekday_thu()}</option>
                      <option value="5">{m.weekday_fri()}</option>
                      <option value="6">{m.weekday_sat()}</option>
                      <option value="7">{m.weekday_sun()}</option>
                    </NativeSelect>
                  </Field>
                </GridItem>
              )}

              <FlagSection
                mode={mode}
                title={m.event_modal_type_section_title()}
                fieldsetTitle={m.event_modal_type_fieldset_title()}
                flagOptions={typeFlagOptions}
                eventFlags={eventFlags}
                flagGroup={typeFlagsAsEventFlags}
                onFlagChange={onTypeFlagChange}
              />

              <FlagSection
                mode={mode}
                title={m.event_modal_location_section_title()}
                fieldsetTitle={m.event_modal_location_fieldset_title()}
                flagOptions={timeLocationFlagOptions}
                eventFlags={eventFlags}
                flagGroup={timeLocationFlagsAsEventFlags}
                onFlagChange={onTimeFlagChange}
              />
            </Grid>
          </form>
        </div>
        <DialogFooter>
          {mode === "view" ? (
            <>
              <Button variant="secondary" onClick={onHide}>
                {m.close()}
              </Button>
              {onSwitchToEdit && <Button onClick={onSwitchToEdit}>{m.edit()}</Button>}
            </>
          ) : (
            <>
              {mode === "edit" && onCancelEditMode && (
                <Button variant="secondary" onClick={onCancelEditMode}>
                  {m.cancel()}
                </Button>
              )}
              <Button variant="outline" onClick={onResetForm}>
                {m.event_modal_reset_form()}
              </Button>
              <Button onClick={onSubmit}>
                {mode === "edit" ? m.event_modal_update_btn() : m.event_modal_add_btn()}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
