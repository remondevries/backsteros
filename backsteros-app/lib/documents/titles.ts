import { parseMarkdownDocument } from "./frontmatter";

export function formatFolderSegmentLabel(segment: string): string {
  return segment
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function titleFromFilename(relativePath: string): string {
  const segment = relativePath.split("/").pop() ?? relativePath;
  return formatFolderSegmentLabel(segment);
}

export function titleFromMarkdownBody(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

export function resolveDocumentTitle(
  relativePath: string,
  content: string,
): string {
  const { frontmatter, body } = parseMarkdownDocument(content);
  return (
    frontmatter.title?.trim() ||
    titleFromMarkdownBody(body) ||
    titleFromFilename(relativePath)
  );
}

/** Hide a leading `# title` in preview when it matches the resolved document title. */
export function stripDuplicateDocumentTitleHeading(
  body: string,
  title: string,
): string {
  const withoutLeadingNewlines = body.replace(/^\n+/, "");
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle) {
    return withoutLeadingNewlines;
  }

  const match = withoutLeadingNewlines.match(/^#\s+(.+?)(?:\r?\n|$)/);
  if (!match) {
    return withoutLeadingNewlines;
  }

  if (match[1]?.trim().toLowerCase() !== normalizedTitle) {
    return withoutLeadingNewlines;
  }

  return withoutLeadingNewlines.slice(match[0].length).replace(/^\n+/, "");
}
