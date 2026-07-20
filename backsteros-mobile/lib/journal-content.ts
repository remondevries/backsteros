/**
 * Lightweight body extract for mobile read view — mirrors
 * `@backsteros/ui` `getDocumentEditorBody` / frontmatter strip.
 */

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

function parseMarkdownBody(content: string): string {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(FRONTMATTER_PATTERN);
  if (match) {
    return match[2] ?? "";
  }

  // Truncated PowerSync snippets may contain only an opening frontmatter fence.
  if (/^---\r?\n/.test(normalized)) {
    return "";
  }

  return normalized;
}

/** Hide a leading `# title` when it matches the journal title / date slug. */
function stripDuplicateTitleHeading(
  body: string,
  dateSlug: string,
  displayTitle?: string,
): string {
  const withoutLeadingNewlines = body.replace(/^\n+/, "");
  const match = withoutLeadingNewlines.match(/^#\s+(.+?)(?:\r?\n|$)/);
  if (!match) {
    return withoutLeadingNewlines;
  }

  const heading = match[1]?.trim() ?? "";
  const normalizedHeading = heading.toLowerCase();
  const titles = [dateSlug, displayTitle]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());

  if (!titles.includes(normalizedHeading)) {
    return withoutLeadingNewlines;
  }

  return withoutLeadingNewlines.slice(match[0].length).replace(/^\n+/, "");
}

export function getJournalDisplayBody(
  content: string,
  dateSlug: string,
  displayTitle?: string,
): string {
  const body = parseMarkdownBody(content);
  return stripDuplicateTitleHeading(body || content, dateSlug, displayTitle)
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** Persist journal body with date-slug title in frontmatter (desktop parity). */
export function mergeJournalContent(title: string, editorBody: string): string {
  const body = editorBody.replace(/^\n+/, "");
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return body;
  }
  return `---\ntitle: ${trimmedTitle}\n---\n\n${body}`;
}
