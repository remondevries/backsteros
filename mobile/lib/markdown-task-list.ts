/**
 * GFM task-list helpers. Also accepts the common typo `- []` (no space).
 * Transforms never touch fenced code blocks or inline `code` spans.
 * (Desktop `documents/markdown-task-list` parity.)
 */

export type MarkdownTaskCheckboxParse = {
  checked: boolean;
  /** Remaining text after the checkbox marker (may be empty). */
  textAfter: string;
};

export type MarkdownTaskListCheckboxMatch = {
  /** 0-based index among real task-list checkboxes (outside code). */
  index: number;
  checked: boolean;
  /** Absolute offset of `[` in the source markdown. */
  openBracket: number;
  /** Absolute offset of `]` in the source markdown. */
  closeBracket: number;
};

/**
 * Apply `transform` only to markdown outside fenced blocks and inline code.
 * Preserves ``` / ~~~ fences and ` / `` code spans so examples stay literal.
 */
export function mapMarkdownOutsideCode(
  markdown: string,
  transform: (chunk: string) => string,
): string {
  if (!markdown) return markdown;

  let result = "";
  let i = 0;
  let fence: { marker: string; len: number } | null = null;

  while (i < markdown.length) {
    if (fence) {
      const lineEnd = markdown.indexOf("\n", i);
      const line =
        lineEnd === -1 ? markdown.slice(i) : markdown.slice(i, lineEnd);
      result += lineEnd === -1 ? line : `${line}\n`;
      i = lineEnd === -1 ? markdown.length : lineEnd + 1;
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1]!.startsWith(fence.marker[0]!) &&
        close[1]!.length >= fence.len
      ) {
        fence = null;
      }
      continue;
    }

    // Start of a fenced code block at line start.
    if (i === 0 || markdown[i - 1] === "\n") {
      const fenceMatch = markdown
        .slice(i)
        .match(/^([ \t]*)(`{3,}|~{3,})([^\n]*)(\n|$)/);
      if (fenceMatch) {
        const full = fenceMatch[0];
        const marker = fenceMatch[2]!;
        result += full;
        i += full.length;
        fence = { marker: marker[0]!, len: marker.length };
        continue;
      }
    }

    const ch = markdown[i]!;
    if (ch === "`") {
      let ticks = 1;
      while (i + ticks < markdown.length && markdown[i + ticks] === "`") {
        ticks += 1;
      }
      // Unclosed inline code — keep the rest literal (no transforms).
      const closer = markdown.indexOf("`".repeat(ticks), i + ticks);
      if (closer === -1) {
        result += markdown.slice(i);
        break;
      }
      result += markdown.slice(i, closer + ticks);
      i = closer + ticks;
      continue;
    }

    // Plain chunk until next backtick, fence candidate, or end.
    let j = i + 1;
    while (j < markdown.length) {
      if (markdown[j] === "`") break;
      if (
        markdown[j] === "\n" &&
        /^[ \t]*(`{3,}|~{3,})/.test(markdown.slice(j + 1))
      ) {
        j += 1;
        break;
      }
      j += 1;
    }
    result += transform(markdown.slice(i, j));
    i = j;
  }

  return result;
}

/** Normalize `- []` / `* []` / `+ []` to standard GFM `- [ ]` (outside code). */
export function normalizeMarkdownTaskLists(markdown: string): string {
  return mapMarkdownOutsideCode(markdown, (chunk) =>
    chunk.replace(/^(\s*[-*+]\s+)\[\](?=\s|$)/gm, "$1[ ]"),
  );
}

/**
 * Parse a leading task-list checkbox from list-item text (after `- ` / `* `).
 * Supports `[ ]`, `[x]` / `[X]`, and empty `[]`.
 * Returns null when the marker is wrapped in backticks (`[ ]`) — keep as code.
 */
export function parseMarkdownTaskCheckbox(
  textAfterMarker: string,
): MarkdownTaskCheckboxParse | null {
  // `` `[ ]` `` / `` `[x]` `` — documenting syntax, not a real checkbox.
  if (/^`+\[[ xX]?\]`/.test(textAfterMarker)) {
    return null;
  }

  const match = textAfterMarker.match(/^\[([ xX]?)\](?:[ \t]+|(?=$))(.*)$/);
  if (!match) {
    return null;
  }

  const mark = match[1] ?? "";
  return {
    checked: mark === "x" || mark === "X",
    textAfter: match[2] ?? "",
  };
}

/** Mark every character that sits inside a fenced or inline code region. */
function buildMarkdownCodeMask(markdown: string): boolean[] {
  const mask = new Array<boolean>(markdown.length).fill(false);
  let i = 0;
  let fence: { marker: string; len: number } | null = null;

  while (i < markdown.length) {
    if (fence) {
      const lineEnd = markdown.indexOf("\n", i);
      const line =
        lineEnd === -1 ? markdown.slice(i) : markdown.slice(i, lineEnd);
      const end = lineEnd === -1 ? markdown.length : lineEnd + 1;
      for (let k = i; k < end; k += 1) mask[k] = true;
      i = end;
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1]!.startsWith(fence.marker[0]!) &&
        close[1]!.length >= fence.len
      ) {
        fence = null;
      }
      continue;
    }

    if (i === 0 || markdown[i - 1] === "\n") {
      const fenceMatch = markdown
        .slice(i)
        .match(/^([ \t]*)(`{3,}|~{3,})([^\n]*)(\n|$)/);
      if (fenceMatch) {
        const full = fenceMatch[0];
        const marker = fenceMatch[2]!;
        for (let k = i; k < i + full.length; k += 1) mask[k] = true;
        i += full.length;
        fence = { marker: marker[0]!, len: marker.length };
        continue;
      }
    }

    if (markdown[i] === "`") {
      let ticks = 1;
      while (i + ticks < markdown.length && markdown[i + ticks] === "`") {
        ticks += 1;
      }
      const closer = markdown.indexOf("`".repeat(ticks), i + ticks);
      if (closer === -1) {
        for (let k = i; k < markdown.length; k += 1) mask[k] = true;
        break;
      }
      for (let k = i; k < closer + ticks; k += 1) mask[k] = true;
      i = closer + ticks;
      continue;
    }

    i += 1;
  }

  return mask;
}

/**
 * Find real task-list checkboxes in document order (skipping code).
 * Matches `- [ ]`, `- [x]` / `- [X]`, and `- []`.
 */
export function findMarkdownTaskListCheckboxes(
  markdown: string,
): MarkdownTaskListCheckboxMatch[] {
  if (!markdown) return [];

  const mask = buildMarkdownCodeMask(markdown);
  const matches: MarkdownTaskListCheckboxMatch[] = [];
  // Line-start list marker + checkbox. Group 1 = prefix through space after bullet.
  const re = /(^|\n)([ \t]*[-*+][ \t]+)\[([ xX]?)\](?=[ \t]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(markdown)) !== null) {
    const prefix = match[2] ?? "";
    const openBracket = match.index + (match[1]?.length ?? 0) + prefix.length;
    if (mask[openBracket]) continue;

    const mark = match[3] ?? "";
    const closeBracket = openBracket + 1 + mark.length;
    matches.push({
      index: matches.length,
      checked: mark === "x" || mark === "X",
      openBracket,
      closeBracket,
    });
  }

  return matches;
}

/**
 * Toggle the Nth real task-list checkbox in `markdown`.
 * Returns the updated source, or null when the index is out of range.
 */
export function toggleMarkdownTaskListItem(
  markdown: string,
  index: number,
): string | null {
  const matches = findMarkdownTaskListCheckboxes(markdown);
  const target = matches[index];
  if (!target) return null;

  const nextInner = target.checked ? " " : "x";
  // Always write a single-character marker: `[ ]` or `[x]` (expands `[]`).
  return (
    markdown.slice(0, target.openBracket) +
    `[${nextInner}]` +
    markdown.slice(target.closeBracket + 1)
  );
}
