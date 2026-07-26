"use client";

import { useMarkdownTaskListInteract } from "../markdown-task-list-interact.js";

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

  const classNames = ["md-task-checkbox", className].filter(Boolean).join(" ");

  if (!interactive) {
    return (
      <span
        className={classNames}
        data-checked={checked ? "true" : "false"}
        aria-hidden="true"
      >
        <span className="md-task-checkbox__box">
          {checked ? <CheckboxCheckIcon /> : null}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${classNames} md-task-checkbox--interactive`}
      data-checked={checked ? "true" : "false"}
      aria-checked={checked}
      aria-label={checked ? "Mark task unchecked" : "Mark task checked"}
      role="checkbox"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        interact?.onToggleAtElement(event.currentTarget);
      }}
      onMouseDown={(event) => {
        // Keep preview double-click-to-edit from stealing the gesture.
        event.stopPropagation();
      }}
    >
      <span className="md-task-checkbox__box">
        {checked ? <CheckboxCheckIcon /> : null}
      </span>
    </button>
  );
}

function CheckboxCheckIcon() {
  return (
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
  );
}
