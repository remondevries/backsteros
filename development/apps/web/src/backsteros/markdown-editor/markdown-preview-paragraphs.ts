/**
 * Split markdown into paragraph segments while preserving blank rows so
 * preview height matches the editor (desktop DocumentMarkdownPreview parity).
 *
 * N consecutive newlines (N >= 2) become N - 1 blank paragraphs. Fenced code
 * blank lines are left intact.
 */

function findFencedCodeRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: { start: number; char: string; len: number } | null = null;
  let offset = 0;
  for (const line of body.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (!fence) {
      const open = line.match(/^([ \t]*)(`{3,}|~{3,})/);
      if (open?.[2]) {
        fence = {
          start: lineStart,
          char: open[2][0] ?? "`",
          len: open[2].length,
        };
      }
    } else {
      const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (close?.[1] && close[1].startsWith(fence.char) && close[1].length >= fence.len) {
        ranges.push([fence.start, lineEnd]);
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence) {
    ranges.push([fence.start, body.length]);
  }
  return ranges;
}

function isIndexInsideRanges(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

export function splitMarkdownPreviewParagraphs(body: string): string[] {
  if (!body) return [];

  const fenceRanges = findFencedCodeRanges(body);
  const parts: string[] = [];
  const blankLineRuns = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blankLineRuns.exec(body)) !== null) {
    if (isIndexInsideRanges(match.index, fenceRanges)) {
      continue;
    }
    parts.push(body.slice(lastIndex, match.index));
    const blankLineCount = match[0].length - 1;
    for (let i = 0; i < blankLineCount; i += 1) {
      parts.push("");
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = body.slice(lastIndex);
  if (rest.length > 0 || parts.length === 0) {
    parts.push(rest);
  }

  return parts;
}

/** Soft line breaks inside a paragraph → markdown hard breaks (editor pre-wrap parity). */
export function withSoftLineHardBreaks(content: string): string {
  return content.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}
