export type DocumentFrontmatter = {
  title?: string;
  status?: "concept" | "published" | "offline";
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  audience?: "group" | "individual";
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquote(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatterBlock(block: string): DocumentFrontmatter {
  const result: DocumentFrontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = unquote(match[2] ?? "");
    switch (key) {
      case "title":
        result.title = value;
        break;
      case "status":
        if (
          value === "concept" ||
          value === "published" ||
          value === "offline"
        ) {
          result.status = value;
        }
        break;
      case "slug":
        result.slug = value;
        break;
      case "seoTitle":
        result.seoTitle = value;
        break;
      case "seoDescription":
        result.seoDescription = value;
        break;
      case "audience":
        if (value === "group" || value === "individual") {
          result.audience = value;
        }
        break;
      default:
        break;
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
    frontmatter: parseFrontmatterBlock(match[1] ?? ""),
    body: match[2] ?? "",
  };
}

function yamlEscape(value: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

export function serializeMarkdownDocument(input: {
  frontmatter?: DocumentFrontmatter;
  body: string;
}): string {
  const body = input.body.replace(/^\n+/, "");
  const fm = input.frontmatter ?? {};
  const lines: string[] = [];
  if (fm.title?.trim()) lines.push(`title: ${yamlEscape(fm.title.trim())}`);
  if (fm.status) lines.push(`status: ${fm.status}`);
  if (fm.slug?.trim()) lines.push(`slug: ${yamlEscape(fm.slug.trim())}`);
  if (fm.seoTitle?.trim()) {
    lines.push(`seoTitle: ${yamlEscape(fm.seoTitle.trim())}`);
  }
  if (fm.seoDescription?.trim()) {
    lines.push(`seoDescription: ${yamlEscape(fm.seoDescription.trim())}`);
  }
  if (fm.audience) lines.push(`audience: ${fm.audience}`);

  if (lines.length === 0) {
    return body;
  }

  return `---\n${lines.join("\n")}\n---\n\n${body}`;
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

/** Persist Spaces publish markdown with YAML front matter. */
export function serializeSpacesDocumentBody(input: {
  body: string;
  title: string;
  status?: DocumentFrontmatter["status"];
  slug?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  audience?: DocumentFrontmatter["audience"];
}): string {
  return serializeMarkdownDocument({
    frontmatter: {
      title: input.title,
      status: input.status,
      slug: input.slug?.trim() || undefined,
      seoTitle: input.seoTitle?.trim() || undefined,
      seoDescription: input.seoDescription?.trim() || undefined,
      audience: input.audience,
    },
    body: input.body,
  });
}

/** Journal entries still store their date label in frontmatter. */
export function mergeJournalContent(
  titleOrInput: string | { title: string; body: string },
  body?: string,
): string {
  if (typeof titleOrInput === "string") {
    return serializeMarkdownDocument({
      frontmatter: { title: titleOrInput },
      body: body ?? "",
    });
  }
  return serializeMarkdownDocument({
    frontmatter: { title: titleOrInput.title },
    body: titleOrInput.body,
  });
}
