import { Input } from "@/components/ui/input";
import { Pencil as PencilIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Dayjs } from "dayjs";
import { useForm, useSelector } from "@tanstack/react-form";
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
  const form = useForm({
    defaultValues: { draft: "" },
    onSubmit: ({ value }) => {
      if (value.draft) {
        onSet(value.draft);
      }
      setIsEditing(false);
    },
  });
  const draft = useSelector(form.atom, (state) => state.values.draft);

  // Seed the draft directly when editing opens, rather than via an effect: this
  // avoids extra renders and can't clobber the user's typing on a background update.
  const startEditing = () => {
    form.reset({ draft: startTime ? startTime.format("HH:mm") : defaultInputTime });
    setIsEditing(true);
  };

  if (!isEditing) {
    return (
      <Button
        variant="link"
        size="sm"
        className="p-0 no-underline align-baseline"
        onClick={startEditing}
      >
        <Icon icon={PencilIcon} className="mr-1" />
        {startTime ? m.edit() : m.personalized_status_flex_set_start()}
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-2 flex-wrap mt-1"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="draft">
        {(field) => (
          <Input
            type="time"
            value={field.value}
            onChange={(event) => field.handleChange(event.target.value)}
            aria-label={m.personalized_status_flex_start_label()}
            className="w-auto"
            autoFocus
          />
        )}
      </form.Field>
      <Button type="submit" variant="default" size="sm" disabled={!draft}>
        {m.save()}
      </Button>
      {startTime && (
        <Button
          type="button"
          variant="outline"
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
        className="p-0 no-underline"
        onClick={() => setIsEditing(false)}
      >
        {m.cancel()}
      </Button>
    </form>
  );
}
