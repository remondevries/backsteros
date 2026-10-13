import type { ReactNode } from "react";

import type { TextRange } from "../../shared/text-diff-ranges.js";

export type HighlightedTextProps = {
  text: string;
  ranges: readonly TextRange[];
  markClassName?: string;
};

/** Renders `text` with `[start, end)` ranges wrapped in `<mark>`. */
export function HighlightedText({
  text,
  ranges,
  markClassName = "spellcheck-fix-mark",
}: HighlightedTextProps): ReactNode {
  if (!ranges.length || !text) return text;

  const sorted = [...ranges]
    .filter((r) => r.end > r.start && r.start < text.length)
    .map((r) => ({
      start: Math.max(0, r.start),
      end: Math.min(text.length, r.end),
    }))
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    const sliceStart = Math.max(range.start, cursor);
    if (range.end > sliceStart) {
      nodes.push(
        <mark key={`m-${index}-${sliceStart}`} className={markClassName}>
          {text.slice(sliceStart, range.end)}
        </mark>,
      );
    }
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}
