/** Server limit for a time-off note, in Unicode characters (see docs/hday-format-spec.md). */
export const MAX_TIME_OFF_NOTE_LENGTH = 1000;

/** Cap a note at the server limit by Unicode characters, so a write is never rejected for length. */
export function clampTimeOffNote(note: string): string {
  const characters = Array.from(note);
  return characters.length > MAX_TIME_OFF_NOTE_LENGTH
    ? characters.slice(0, MAX_TIME_OFF_NOTE_LENGTH).join("")
    : note;
}
