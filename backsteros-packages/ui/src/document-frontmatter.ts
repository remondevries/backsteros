export type DocumentFrontmatter = {
  title?: string;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatterBlock(block: string): DocumentFrontmatter {
  const result: DocumentFrontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^title:\s*(.+)$/);
    if (match) {
      const raw = match[1].trim();
      result.title = raw.replace(/^['"]|['"]$/g, "");
    }
  }

  return result;
}

export function parseMarkdownDocument(content: string): {
  frontmatter: DocumentFrontmatter;
  body: string;
} {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  return {
    frontmatter: parseFrontmatterBlock(match[1]),
    body: match[2],
  };
}

export function serializeMarkdownDocument(input: {
  frontmatter?: DocumentFrontmatter;
  body: string;
}): string {
  const title = input.frontmatter?.title?.trim();
  const body = input.body.replace(/^\n+/, "");

  if (!title) {
    return body;
  }

  return `---\ntitle: ${title}\n---\n\n${body}`;
}

/** Hide a leading `# title` in preview/editor when it matches the document title. */
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

/** Body shown in CodeMirror — frontmatter and duplicate `# title` are omitted. */
export function getDocumentEditorBody(content: string, title: string): string {
  const { body } = parseMarkdownDocument(content);
  return stripDuplicateDocumentTitleHeading(body || content, title);
}

/** Persist non-journal document body without embedding the title in the file. */
export function serializeDocumentBody(body: string): string {
  return body.replace(/^\n+/, "");
}

/** Journal entries still store their date label in frontmatter. */
export function mergeJournalContent(title: string, editorBody: string): string {
  return serializeMarkdownDocument({
    frontmatter: { title: title.trim() },
    body: editorBody,
  });
}
