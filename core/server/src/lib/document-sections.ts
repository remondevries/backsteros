/**
 * Markdown ATX heading section parse / replace.
 * Replacements splice only the matched section body so front matter and
 * every other byte of the file stay unchanged.
 */

const ATX_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

export type DocumentSection = {
  level: number;
  /** Heading text without leading # markers. */
  heading: string;
  slug: string;
  /** Ancestor headings + this heading (root → leaf). */
  path: string[];
  /** Absolute offset of the heading line in `content`. */
  headingStart: number;
  /** Absolute offset of the first body byte after the heading line. */
  bodyStart: number;
  /** Absolute exclusive end of this section (next same/higher heading or EOF). */
  end: number;
};

export class DocumentSectionError extends Error {
  constructor(
    message: string,
    readonly code: "SECTION_NOT_FOUND" | "SECTION_AMBIGUOUS",
  ) {
    super(message);
    this.name = "DocumentSectionError";
  }
}

export function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Split raw markdown into front-matter prefix (unchanged bytes) + body. */
export function splitRawFrontMatter(content: string): {
  prefix: string;
  body: string;
  bodyOffset: number;
} {
  if (!content.startsWith("---")) {
    return { prefix: "", body: content, bodyOffset: 0 };
  }
  const afterOpen = content.startsWith("---\r\n")
    ? 5
    : content.startsWith("---\n")
      ? 4
      : -1;
  if (afterOpen < 0) {
    return { prefix: "", body: content, bodyOffset: 0 };
  }
  const closeLf = content.indexOf("\n---\n", afterOpen);
  const closeCrlf = content.indexOf("\r\n---\r\n", afterOpen);
  let closeAt = -1;
  let closeLen = 0;
  if (closeLf >= 0 && (closeCrlf < 0 || closeLf < closeCrlf)) {
    closeAt = closeLf;
    closeLen = "\n---\n".length;
  } else if (closeCrlf >= 0) {
    closeAt = closeCrlf;
    closeLen = "\r\n---\r\n".length;
  }
  if (closeAt < 0) {
    // closing --- at EOF
    const closeEofLf = content.indexOf("\n---", afterOpen);
    if (closeEofLf >= 0 && closeEofLf + 4 === content.length) {
      return { prefix: content, body: "", bodyOffset: content.length };
    }
    return { prefix: "", body: content, bodyOffset: 0 };
  }
  const bodyOffset = closeAt + closeLen;
  return {
    prefix: content.slice(0, bodyOffset),
    body: content.slice(bodyOffset),
    bodyOffset,
  };
}

export function parseDocumentSections(content: string): DocumentSection[] {
  const { body, bodyOffset } = splitRawFrontMatter(content);
  const lines: { text: string; start: number; end: number }[] = [];
  let offset = 0;
  while (offset <= body.length) {
    const nextNl = body.indexOf("\n", offset);
    const end = nextNl < 0 ? body.length : nextNl + 1;
    lines.push({
      text: body.slice(offset, nextNl < 0 ? body.length : nextNl),
      start: bodyOffset + offset,
      end: bodyOffset + end,
    });
    if (nextNl < 0) break;
    offset = nextNl + 1;
  }

  const headings: {
    level: number;
    heading: string;
    slug: string;
    headingStart: number;
    bodyStart: number;
    lineIndex: number;
  }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.text.match(ATX_HEADING);
    if (!match) continue;
    const level = match[1]!.length;
    const heading = match[2]!.trim();
    headings.push({
      level,
      heading,
      slug: slugifyHeading(heading),
      headingStart: line.start,
      bodyStart: line.end,
      lineIndex: i,
    });
  }

  if (headings.length === 0) {
    return [];
  }

  const stack: { level: number; heading: string }[] = [];
  const sections: DocumentSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    while (stack.length && stack[stack.length - 1]!.level >= h.level) {
      stack.pop();
    }
    stack.push({ level: h.level, heading: h.heading });
    let end = content.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j]!.level <= h.level) {
        end = headings[j]!.headingStart;
        break;
      }
    }
    sections.push({
      level: h.level,
      heading: h.heading,
      slug: h.slug,
      path: stack.map((entry) => entry.heading),
      headingStart: h.headingStart,
      bodyStart: h.bodyStart,
      end,
    });
  }

  return sections;
}

function normalizeHeadingQuery(query: string): string {
  return query.trim().replace(/^\/+|\/+$/g, "");
}

function pathKey(path: string[]): string {
  return path.map((part) => slugifyHeading(part)).join("/");
}

/**
 * Resolve a heading query (slug, exact title, or slash-separated path).
 * Throws SECTION_NOT_FOUND / SECTION_AMBIGUOUS.
 */
export function findDocumentSection(
  content: string,
  headingQuery: string,
): DocumentSection {
  const query = normalizeHeadingQuery(headingQuery);
  if (!query) {
    throw new DocumentSectionError("Heading is required", "SECTION_NOT_FOUND");
  }
  const sections = parseDocumentSections(content);
  const querySlug = slugifyHeading(query);
  const queryPath = query
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const queryPathKey = queryPath.map((part) => slugifyHeading(part)).join("/");

  const matches = sections.filter((section) => {
    if (section.slug === querySlug) return true;
    if (slugifyHeading(section.heading) === querySlug) return true;
    if (section.heading.toLowerCase() === query.toLowerCase()) return true;
    if (pathKey(section.path) === queryPathKey) return true;
    if (section.path.map((p) => p.toLowerCase()).join("/") === query.toLowerCase()) {
      return true;
    }
    return false;
  });

  if (matches.length === 0) {
    throw new DocumentSectionError(
      `Heading not found: ${headingQuery}`,
      "SECTION_NOT_FOUND",
    );
  }
  if (matches.length > 1) {
    throw new DocumentSectionError(
      `Ambiguous heading: ${headingQuery}`,
      "SECTION_AMBIGUOUS",
    );
  }
  return matches[0]!;
}

export function readDocumentSection(
  content: string,
  headingQuery: string,
): { section: DocumentSection; text: string } {
  const section = findDocumentSection(content, headingQuery);
  return {
    section,
    text: content.slice(section.headingStart, section.end),
  };
}

/**
 * Replace only the body under the matched heading. Front matter and all
 * other sections are preserved byte-for-byte.
 */
export function replaceDocumentSectionBody(
  content: string,
  headingQuery: string,
  nextBody: string,
): { content: string; section: DocumentSection } {
  const section = findDocumentSection(content, headingQuery);
  let body = nextBody;
  // Section bodies in the file usually end with a trailing newline before the
  // next heading. Normalize so callers can pass body with or without one.
  if (body.length > 0 && !body.endsWith("\n") && section.end < content.length) {
    body = `${body}\n`;
  }
  const next =
    content.slice(0, section.bodyStart) + body + content.slice(section.end);
  return { content: next, section };
}

/** Body-only text for retrieval scoring (no heading line). */
export function sectionBodyText(content: string, section: DocumentSection): string {
  return content.slice(section.bodyStart, section.end);
}
