export type DocumentFrontmatter = {
  title?: string;
  status?: "concept" | "published" | "offline";
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  audience?: "group" | "individual";
  /** Unknown YAML keys preserved on round-trip (room, material, …). */
  extras?: Record<string, string>;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const KNOWN_FRONTMATTER_KEYS = new Set([
  "title",
  "status",
  "slug",
  "seoTitle",
  "seoDescription",
  "audience",
]);

function unquote(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatterBlock(block: string): DocumentFrontmatter {
  const result: DocumentFrontmatter = {};
  const extras: Record<string, string> = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1] ?? "";
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
        if (key) extras[key] = value;
        break;
    }
  }

  if (Object.keys(extras).length > 0) {
    result.extras = extras;
  }
  return result;
}

/** Raw `---` … `---` fence from source content, or null. */
export function extractRawFrontmatterFence(content: string): string | null {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return null;
  return `---\n${match[1]}\n---`;
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
  if (fm.extras) {
    for (const [key, value] of Object.entries(fm.extras)) {
      if (KNOWN_FRONTMATTER_KEYS.has(key)) continue;
      if (!value.trim()) continue;
      lines.push(`${key}: ${yamlEscape(value)}`);
    }
  }

  if (lines.length === 0) {
    return body;
  }

  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

/**
 * Reattach the original YAML front matter fence verbatim onto an edited body.
 * Unknown keys (room, material, dateNoted, source, …) are preserved.
 */
export function rejoinDocumentFrontmatter(
  sourceContent: string,
  editorBody: string,
): string {
  const fence = extractRawFrontmatterFence(sourceContent);
  const body = editorBody.replace(/^\n+/, "");
  if (!fence) return body;
  return `${fence}\n\n${body}`;
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

/**
 * Persist non-journal document body. When `sourceContent` is provided, the
 * original YAML front matter fence is kept verbatim (all keys).
 */
export function serializeDocumentBody(
  body: string,
  options?: { sourceContent?: string | null },
): string {
  const source = options?.sourceContent;
  if (source && extractRawFrontmatterFence(source)) {
    return rejoinDocumentFrontmatter(source, body);
  }
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
  /** When set, unknown front-matter keys from the source file are kept. */
  sourceContent?: string | null;
}): string {
  const fromSource = input.sourceContent
    ? parseMarkdownDocument(input.sourceContent).frontmatter
    : {};
  return serializeMarkdownDocument({
    frontmatter: {
      title: input.title,
      status: input.status,
      slug: input.slug?.trim() || undefined,
      seoTitle: input.seoTitle?.trim() || undefined,
      seoDescription: input.seoDescription?.trim() || undefined,
      audience: input.audience,
      extras: fromSource.extras,
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
