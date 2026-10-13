"use client";

import { useEffect, useRef, useState } from "react";

export type AddProjectInlineProps = {
  onCancel: () => void;
  onSubmit: (name: string) => void | Promise<void>;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  ariaLabel?: string;
};

/**
 * Inline create row for projects list status groups — name only.
 */
export function AddProjectInline({
  onCancel,
  onSubmit,
  disabled = false,
  error = null,
  placeholder = "Project name",
  ariaLabel = "Project name",
}: AddProjectInlineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    if (submittingRef.current || disabled) return;
    submittingRef.current = true;
    try {
      await onSubmit(trimmed);
      setName("");
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <div ref={containerRef} className="add-project-inline">
      <form
        className="add-project-inline__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="add-project-inline__dot" aria-hidden="true" />
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            const related = document.activeElement;
            if (related && containerRef.current?.contains(related)) {
              return;
            }
            if (name.trim() && !submittingRef.current) {
              void submit();
              return;
            }
            onCancel();
          }}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="add-project-inline__input"
        />
      </form>
      {error ? (
        <p className="add-project-inline__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
