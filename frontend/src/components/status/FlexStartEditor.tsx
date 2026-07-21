import { useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { Dayjs } from "dayjs";
import * as m from "@/paraglide/messages.js";

interface FlexStartEditorProps {
  /** Currently effective manual start time, or null when none is set. */
  startTime: Dayjs | null;
  /** 24-hour `HH:mm` used to prefill the input when nothing is set yet. */
  defaultInputTime: string;
  onSet: (time: string) => void;
  onClear: () => void;
}

/**
 * Lightweight "I started at ..." control for flex shifts, for people who do
 * not use time-tracking. Shows a pencil to reveal an inline time input.
 *
 * There is deliberately no "sync to now" button: people typically clock in
 * before their laptop boots, so "now" would be wrong.
 */
export function FlexStartEditor({
  startTime,
  defaultInputTime,
  onSet,
  onClear,
}: FlexStartEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Seed the draft directly when editing opens, rather than via an effect: this
  // avoids extra renders and can't clobber the user's typing on a background update.
  const startEditing = () => {
    setDraft(startTime ? startTime.format("HH:mm") : defaultInputTime);
    setIsEditing(true);
  };

  if (!isEditing) {
    return (
      <Button
        variant="link"
        size="sm"
        className="p-0 text-decoration-none align-baseline"
        onClick={startEditing}
      >
        <i className="bi bi-pencil me-1" aria-hidden="true"></i>
        {startTime ? m.edit() : m.personalized_status_flex_set_start()}
      </Button>
    );
  }

  const handleSave = () => {
    if (draft) {
      onSet(draft);
    }
    setIsEditing(false);
  };

  return (
    <Form
      className="d-flex align-items-center gap-2 flex-wrap mt-1"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <Form.Control
        type="time"
        size="sm"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={m.personalized_status_flex_start_label()}
        style={{ width: "auto" }}
        autoFocus
      />
      <Button type="submit" variant="primary" size="sm" disabled={!draft}>
        {m.save()}
      </Button>
      {startTime && (
        <Button
          type="button"
          variant="outline-secondary"
          size="sm"
          onClick={() => {
            onClear();
            setIsEditing(false);
          }}
        >
          {m.personalized_status_flex_clear()}
        </Button>
      )}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="p-0 text-decoration-none"
        onClick={() => setIsEditing(false)}
      >
        {m.cancel()}
      </Button>
    </Form>
  );
}
