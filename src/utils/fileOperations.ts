/**
 * Import an .hday file from user's file system.
 * @param file - The file to import
 * @returns Promise resolving to the file content as text
 * @throws Error if file reading fails
 */
export async function importHdayFile(file: File): Promise<string> {
  return await file.text();
}

/**
 * Export .hday content as a downloadable file.
 * @param content - The .hday file content to export
 * @param filename - Name of the file to download (default: "timeoff.hday")
 */
export function exportHdayFile(content: string, filename: string = "timeoff.hday"): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
