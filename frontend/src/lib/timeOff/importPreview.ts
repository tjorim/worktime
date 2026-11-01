import { hdayToTimeOffEntries, timeOffEntriesToHday } from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";

export const MAX_HDAY_IMPORT_BYTES = 1024 * 1024;

export function previewTimeOffImport(text: string, existing: TimeOffEntry[]) {
  const entries: TimeOffEntry[] = [];
  const invalidLines: { line: number; reason: "date" | "syntax" }[] = [];
  const seen = new Set<string>();
  const existingKeys = new Set(existing.map((entry) => timeOffEntriesToHday([entry])));
  let duplicates = 0;
  const additions: TimeOffEntry[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let reason: "date" | "syntax" = "syntax";
    const result = hdayToTimeOffEntries(line, (invalidReason) => {
      reason = invalidReason;
    });
    const entry = result.entries[0];
    if (!entry) {
      invalidLines.push({ line: index + 1, reason });
      return;
    }
    const key = timeOffEntriesToHday([entry]);
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    entries.push(entry);
    if (existingKeys.has(key)) duplicates++;
    else additions.push(entry);
  });
  return { entries, additions, duplicates, invalidLines };
}
