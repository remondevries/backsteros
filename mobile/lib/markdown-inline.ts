/**
 * Lightweight markdown inline/block helpers for native preview.
 * Not full CommonMark — covers the patterns we show in task/project bodies.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "del"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type TableAlignment = "left" | "center" | "right" | null;

export type MarkdownTable = {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
};

export type BlockKind =
  | { kind: "heading"; level: number; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "hr" }
  | { kind: "table"; table: MarkdownTable }
  | { kind: "paragraph"; text: string };

/** Match ATX headings (`#` … `######`). */
export function matchMarkdownHeading(
  text: string,
): { level: number; text: string } | null {
  const match = text.match(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
  if (!match) return null;
  return {
    level: match[1]!.length,
    text: match[2]!.trim(),
  };
}

export function matchBlockquote(text: string): string | null {
  if (!/^>[ \t]?/.test(text)) return null;
  return text
    .split("\n")
    .map((line) => line.replace(/^>[ \t]?/, ""))
    .join("\n");
}

export function isHorizontalRule(text: string): boolean {
  return /^(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(text.trim());
}

/** Split a GFM table row into cell strings. */
export function splitMarkdownTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseTableAlignment(cell: string): TableAlignment {
  const value = cell.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function isTableDelimiterRow(line: string): boolean {
  const cells = splitMarkdownTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return splitMarkdownTableCells(trimmed).length > 0;
}

/**
 * Parse a GFM pipe table. Returns null when the block is not a valid table
 * (needs a header row + delimiter row).
 */
export function parseMarkdownTable(text: string): MarkdownTable | null {
  const nonEmpty = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (nonEmpty.length < 2) return null;
  if (!looksLikeTableRow(nonEmpty[0]!)) return null;
  if (!isTableDelimiterRow(nonEmpty[1]!)) return null;

  const headers = splitMarkdownTableCells(nonEmpty[0]!);
  if (headers.length === 0) return null;

  const delimiterCells = splitMarkdownTableCells(nonEmpty[1]!);
  const alignments: TableAlignment[] = headers.map((_, index) => {
    const cell = delimiterCells[index] ?? "";
    return cell ? parseTableAlignment(cell) : null;
  });

  const columnCount = headers.length;
  const rows = nonEmpty.slice(2).map((line) => {
    const cells = splitMarkdownTableCells(line);
    const normalized = cells.slice(0, columnCount);
    while (normalized.length < columnCount) normalized.push("");
    return normalized;
  });

  return { headers, alignments, rows };
}

export type MarkdownContentPart =
  | { type: "table"; table: MarkdownTable }
  | { type: "text"; text: string };

/**
 * Split a paragraph into text + GFM table parts so tables still render when
 * they share a blank-line-free block with surrounding copy.
 */
export function splitMarkdownContentParts(text: string): MarkdownContentPart[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const parts: MarkdownContentPart[] = [];
  let buffer: string[] = [];

  function flushBuffer() {
    if (buffer.length === 0) return;
    const chunk = buffer.join("\n");
    buffer = [];
    if (chunk.trim() === "") return;
    parts.push({ type: "text", text: chunk });
  }

  let index = 0;
  while (index < lines.length) {
    const header = lines[index] ?? "";
    const delimiter = lines[index + 1];
    if (
      delimiter !== undefined &&
      looksLikeTableRow(header) &&
      isTableDelimiterRow(delimiter)
    ) {
      flushBuffer();
      const tableLines = [header, delimiter];
      index += 2;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        if (next.trim() === "" || !looksLikeTableRow(next)) break;
        if (isTableDelimiterRow(next)) break;
        tableLines.push(next);
        index += 1;
      }
      const table = parseMarkdownTable(tableLines.join("\n"));
      if (table) {
        parts.push({ type: "table", table });
      } else {
        buffer.push(...tableLines);
      }
      continue;
    }
    buffer.push(header);
    index += 1;
  }

  flushBuffer();
  return parts.length > 0 ? parts : [{ type: "text", text }];
}

export function classifyMarkdownBlock(text: string): BlockKind {
  const trimmed = text.trimEnd();
  const table = parseMarkdownTable(trimmed);
  if (table) return { kind: "table", table };
  if (isHorizontalRule(trimmed)) return { kind: "hr" };
  const heading = matchMarkdownHeading(trimmed);
  if (heading) {
    return { kind: "heading", level: heading.level, text: heading.text };
  }
  const quote = matchBlockquote(trimmed);
  if (quote !== null) return { kind: "blockquote", text: quote };
  return { kind: "paragraph", text };
}

/**
 * Tokenize a markdown string into inline nodes (bold, italic, code, links, strike).
 * Nested emphasis is shallow — good enough for preview polish.
 */
export function parseInlineMarkdown(input: string): InlineNode[] {
  if (!input) return [];

  const nodes: InlineNode[] = [];
  // Order: code → link → bold → strike → italic
  const pattern =
    /(`+)((?:(?!\1).)+?)\1|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/gs;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: input.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push({ type: "code", value: match[2] });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      nodes.push({
        type: "link",
        href: match[4],
        children: parseInlineMarkdown(match[3]),
      });
    } else if (match[5] !== undefined) {
      nodes.push({ type: "strong", children: parseInlineMarkdown(match[5]) });
    } else if (match[6] !== undefined) {
      nodes.push({ type: "strong", children: parseInlineMarkdown(match[6]) });
    } else if (match[7] !== undefined) {
      nodes.push({ type: "del", children: parseInlineMarkdown(match[7]) });
    } else if (match[8] !== undefined) {
      nodes.push({ type: "em", children: parseInlineMarkdown(match[8]) });
    } else if (match[9] !== undefined) {
      nodes.push({ type: "em", children: parseInlineMarkdown(match[9]) });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    nodes.push({ type: "text", value: input.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value: input }];
}
