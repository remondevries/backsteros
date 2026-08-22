"use client";

import { useRef, type MouseEvent } from "react";

export type PolishedCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  /** Drop markdown list top margin (default true for UI lists). */
  flush?: boolean;
  /**
   * Called when the control is activated. Receives the next checked value
   * (indeterminate → checked) and the originating mouse event (for shift-click).
   */
  onCheckedChange?: (checked: boolean, event: MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Shared polished checkbox — same visual language as markdown task checkboxes.
 */
export function PolishedCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  ariaLabel,
  className,
  flush = true,
  onCheckedChange,
}: PolishedCheckboxProps) {
  const isChecked = checked && !indeterminate;
  const classNames = [
    "md-task-checkbox",
    "md-task-checkbox--interactive",
    flush ? "md-task-checkbox--flush" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  // Shift+click is handled on mousedown so range-select still works when the
  // browser starts a text-selection gesture and cancels the subsequent click.
  const shiftHandledRef = useRef(false);

  const emitChange = (event: MouseEvent<HTMLButtonElement>) => {
    const next = indeterminate ? true : !checked;
    onCheckedChange?.(next, event);
  };

  return (
    <button
      type="button"
      className={classNames}
      data-checked={isChecked ? "true" : "false"}
      data-indeterminate={indeterminate ? "true" : undefined}
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      role="checkbox"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        if (shiftHandledRef.current) {
          shiftHandledRef.current = false;
          return;
        }
        emitChange(event);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (disabled) return;
        if (!event.shiftKey) return;
        event.preventDefault();
        shiftHandledRef.current = true;
        emitChange(event);
      }}
    >
      <span className="md-task-checkbox__box">
        {indeterminate ? (
          <IndeterminateIcon />
        ) : isChecked ? (
          <CheckIcon />
        ) : null}
      </span>
    </button>
  );
}

function CheckIcon() {
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

function IndeterminateIcon() {
  return (
    <svg
      className="md-task-checkbox__check"
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden="true"
    >
      <path
        d="M3.5 8h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
