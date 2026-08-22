"use client";

import { useMarkdownTaskListInteract } from "../documents/markdown-task-list-interact.js";
import { PolishedCheckbox } from "./polished-checkbox.js";

export type MarkdownTaskCheckboxProps = {
  checked: boolean;
  /** Optional class on the wrapper. */
  className?: string;
};

/**
 * Polished checkbox for markdown task-list items in preview.
 * When the preview provides an onChange handler, clicks toggle the source markdown.
 */
export function MarkdownTaskCheckbox({
  checked,
  className,
}: MarkdownTaskCheckboxProps) {
  const interact = useMarkdownTaskListInteract();
  const interactive = Boolean(interact?.onToggleAtElement);

  if (!interactive) {
    return (
      <span
        className={["md-task-checkbox", className].filter(Boolean).join(" ")}
        data-checked={checked ? "true" : "false"}
        aria-hidden="true"
      >
        <span className="md-task-checkbox__box">
          {checked ? (
            <svg
              className="md-task-checkbox__check"
              viewBox="0 0 16 16"
              width="10"
              height="10"
              aria-hidden="true"
            >
              <path
                d="M3.5 8.5l2.5 2.5 6.5-6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <PolishedCheckbox
      className={className}
      flush={false}
      checked={checked}
      ariaLabel={checked ? "Mark task unchecked" : "Mark task checked"}
      onCheckedChange={(_next, event) => {
        interact?.onToggleAtElement(event.currentTarget);
      }}
    />
  );
}
