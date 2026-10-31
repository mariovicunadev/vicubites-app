/** RFC 4180: quote a field when it contains a comma, a quote or a line break. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(",") + "\r\n";
}
