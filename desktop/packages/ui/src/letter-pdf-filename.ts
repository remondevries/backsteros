export function stripPdfExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "Document";
  return trimmed.replace(/\.pdf$/i, "") || "Document";
}

export function withPdfExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Document.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}
