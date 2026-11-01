import { describe, expect, it } from "vitest";
import { previewTimeOffImport } from "@/lib/timeOff/importPreview";
import { hdayToTimeOffEntries } from "@/lib/timeOff/codecs";

describe("time off import preview", () => {
  it("merges without removing existing entries and skips exact duplicates", () => {
    const existing = hdayToTimeOffEntries("2026/01/01 # Existing").entries;
    const preview = previewTimeOffImport(
      "2026/01/01 # Existing\n2026/02/01 # New\n2026/02/01 # New",
      existing,
    );
    expect(preview.additions).toHaveLength(1);
    expect(preview.duplicates).toBe(2);
    expect([...existing, ...preview.additions].map((entry) => entry.note)).toEqual([
      "Existing",
      "New",
    ]);
    expect(preview.entries.map((entry) => entry.note)).toEqual(["Existing", "New"]);
  });

  it("distinguishes flags, type, dates and note", () => {
    const existing = hdayToTimeOffEntries("2026/01/01 # Existing").entries;
    expect(
      previewTimeOffImport(
        "a2026/01/01 # Existing\nb2026/01/01 # Existing\n2026/01/02 # Existing\n2026/01/01 # Other",
        existing,
      ).additions,
    ).toHaveLength(4);
  });

  it("rejects empty or fully invalid content and reports original line numbers", () => {
    expect(previewTimeOffImport(" \n", []).entries).toEqual([]);
    const preview = previewTimeOffImport(
      "\ninvalid\n2026/02/30\n2026/03/02-2026/03/01\n2026/04/01",
      [],
    );
    expect(preview.invalidLines).toEqual([
      { line: 2, reason: "syntax" },
      { line: 3, reason: "date" },
      { line: 4, reason: "date" },
    ]);
    expect(preview.entries).toHaveLength(1);
    expect(previewTimeOffImport("invalid", []).entries).toEqual([]);
  });
});
