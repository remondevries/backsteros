import type { KeyboardEvent, ReactNode } from "react";

import type { SpellcheckSegment } from "../text-diff-ranges.js";

export type SpellcheckSegmentTextProps = {
  segments: readonly SpellcheckSegment[];
  onToggleSegment?: (segmentId: string) => void;
};

/** Interactive spellcheck text: orange = applied fix, grey = reset to original. */
export function SpellcheckSegmentText({
  segments,
  onToggleSegment,
}: SpellcheckSegmentTextProps): ReactNode {
  if (!segments.length) return null;

  return segments.map((segment) => {
    if (segment.kind === "equal") {
      return <span key={segment.id}>{segment.after}</span>;
    }

    const text = segment.active ? segment.after : segment.before;
    const empty = text.length === 0;
    const className = [
      "spellcheck-fix-mark",
      segment.active ? "is-active" : "is-reverted",
      empty ? "is-empty" : "",
      onToggleSegment ? "is-interactive" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const label = segment.active
      ? empty
        ? "Click to restore removed text"
        : "Click to restore original"
      : empty
        ? "Click to re-apply insertion"
        : "Click to re-apply spellcheck";

    const activate = () => onToggleSegment?.(segment.id);

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      activate();
    };

    return (
      <mark
        key={segment.id}
        className={className}
        title={label}
        aria-label={label}
        aria-pressed={segment.active}
        role={onToggleSegment ? "button" : undefined}
        tabIndex={onToggleSegment ? 0 : undefined}
        onClick={
          onToggleSegment
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                activate();
              }
            : undefined
        }
        onKeyDown={onToggleSegment ? onKeyDown : undefined}
      >
        {empty ? "\u00a0" : text}
      </mark>
    );
  });
}
