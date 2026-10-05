import {
  CircleCheck as CircleCheckIcon,
  Clipboard as ClipboardIcon,
  RotateCcw as RotateCcwIcon,
  SquareCode as SquareCodeIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId } from "react";
import { useToast } from "@/contexts/ToastContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import * as m from "@/paraglide/messages.js";

type TimeOffRawViewProps = {
  rawText: string;
  error?: string;
  skippedLines?: string[];
  isDirty: boolean;
  onChangeRawText: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function TimeOffRawView({
  rawText,
  error,
  skippedLines,
  isDirty,
  onChangeRawText,
  onApply,
  onReset,
}: TimeOffRawViewProps) {
  const errorId = useId();
  const skippedId = useId();
  const toast = useToast();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch {
      toast.showError(m.timeoff_copy_raw_failed());
    }
  };

  return (
    <Accordion>
      <AccordionItem value="raw-editor">
        <AccordionTrigger>
          <Icon icon={SquareCodeIcon} className="mr-2" />
          {m.timeoff_raw_editor_heading()}
          {isDirty && (
            <Badge variant="warning" className="ml-2" title={m.timeoff_unsaved_changes()}>
              •
            </Badge>
          )}
        </AccordionTrigger>
        <AccordionContent>
          <FieldDescription className="mb-3">{m.timeoff_raw_help()}</FieldDescription>
          <Field className="mb-3" data-invalid={!!error}>
            <FieldLabel htmlFor="hdayText" className="sr-only">
              {m.timeoff_raw_content_label()}
            </FieldLabel>
            <Textarea
              id="hdayText"
              rows={20}
              value={rawText}
              onChange={(event) => onChangeRawText(event.target.value)}
              placeholder={m.timeoff_raw_placeholder()}
              className="field-sizing-fixed font-mono"
              aria-describedby={
                [error ? errorId : null, skippedLines?.length ? skippedId : null]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              aria-invalid={!!error}
            />
            {error && <FieldError id={errorId}>{error}</FieldError>}
            {skippedLines && skippedLines.length > 0 && (
              <div id={skippedId} className="text-warning" role="alert">
                <small>
                  <strong>{m.timeoff_hday_skipped_lines_heading()}</strong>
                </small>
                <ul className="m-0 font-mono text-sm">
                  {skippedLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!rawText}
              aria-label={m.timeoff_copy_raw_aria()}
              title={m.timeoff_copy_raw_aria()}
            >
              <Icon icon={ClipboardIcon} className="mr-1" />
              {m.timeoff_copy_raw()}
            </Button>
            <Button onClick={onApply}>
              <Icon icon={CircleCheckIcon} className="mr-1" />
              {m.timeoff_apply_raw()}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={!isDirty}>
              <Icon icon={RotateCcwIcon} className="mr-1" />
              {m.timeoff_reset_btn()}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
