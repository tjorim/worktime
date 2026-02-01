/**
 * Check if an event target is an editable element.
 * Used to determine whether keyboard shortcuts should be active.
 *
 * @param target - The event target to check
 * @returns True if the target is an editable element (text input, textarea, select, or contenteditable)
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const isTextInput =
    target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio";

  return (
    isTextInput ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
