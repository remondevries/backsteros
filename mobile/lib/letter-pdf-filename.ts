/** Display name for a letter PDF tab — matches `@backsteros/ui` `stripPdfExtension`. */
export function stripPdfExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "Document";
  return trimmed.replace(/\.pdf$/i, "") || "Document";
}

/** Ensure a PDF filename has a `.pdf` extension — matches `@backsteros/ui`. */
export function withPdfExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Document.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}
