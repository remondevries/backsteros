"use client";

import type { ButtonHTMLAttributes, ReactNode, SyntheticEvent } from "react";

export function stopListPropertyFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export type ListPropertyIconTriggerProps = {
  label: string;
  children: ReactNode;
  open?: boolean;
  disabled?: boolean;
  triggerId?: string;
  onToggle?: () => void;
  className?: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children" | "onClick" | "onMouseDown" | "disabled" | "id"
>;

/**
 * Shared icon-only property trigger for task/inbox/project/letter list rows.
 */
export function ListPropertyIconTrigger({
  label,
  children,
  open = false,
  disabled = false,
  triggerId,
  onToggle,
  className = "task-item-row__icon-trigger",
  ...rest
}: ListPropertyIconTriggerProps) {
  return (
    <button
      type="button"
      id={triggerId}
      className={className}
      title={label}
      tabIndex={-1}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label}
      onMouseDown={stopListPropertyFieldEvent}
      onClick={(event) => {
        stopListPropertyFieldEvent(event);
        onToggle?.();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
