"use client";

import { useEffect, useRef, useState } from "react";

import { TaskPriorityIcon } from "./task-priority-icon.js";

export type AddInboxTaskInlineProps = {
  onCancel: () => void;
  onSubmit: (title: string) => void | Promise<void>;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  ariaLabel?: string;
};

/**
 * Quick-capture row for inbox / project task lists — title only.
 */
export function AddInboxTaskInline({
  onCancel,
  onSubmit,
  disabled = false,
  error = null,
  placeholder = "Quick capture…",
  ariaLabel = "Inbox task title",
}: AddInboxTaskInlineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    if (submittingRef.current || disabled) return;
    submittingRef.current = true;
    try {
      await onSubmit(trimmed);
      setTitle("");
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <div ref={containerRef} className="add-inbox-task-inline">
      <form
        className="add-inbox-task-inline__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="add-inbox-task-inline__priority" aria-hidden="true">
          <TaskPriorityIcon priority={0} size={14} />
        </span>
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            const related = document.activeElement;
            if (
              related &&
              containerRef.current?.contains(related)
            ) {
              return;
            }
            if (title.trim() && !submittingRef.current) {
              void submit();
              return;
            }
            onCancel();
          }}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="add-inbox-task-inline__input"
        />
      </form>
      {error ? (
        <p className="add-inbox-task-inline__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
