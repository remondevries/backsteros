export function stripPdfExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "Document";
  return trimmed.replace(/\.pdf$/i, "") || "Document";
}

/**
 * Letter / vault subject from a PDF display name.
 * Strips `.pdf` and a leading `YYYY-MM-DD - ` (matches core filing).
 */
export function letterPdfSubjectFromFilename(filename: string): string {
  const withoutExt = stripPdfExtension(filename);
  const withoutLeadingDate = withoutExt
    .replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, "")
    .trim();
  return withoutLeadingDate || withoutExt || "Letter";
}

export function withPdfExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Document.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}
