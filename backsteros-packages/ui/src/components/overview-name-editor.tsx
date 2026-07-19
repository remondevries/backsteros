"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";

import { CONTENT_DETAIL_TITLE_CLASS } from "./content-detail-title-header.js";

export type OverviewNameEditorProps = {
  value: string;
  entityLabel: string;
  resetKey?: string;
  autoEdit?: boolean;
  /** Increment to focus the title field and select its text. */
  renameFocusRequest?: number;
  /** When set, Enter/Tab commit then call this instead of staying on the title. */
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  /** Fires on every keystroke while editing (compose / empty-create flows). */
  onDraftChange?: (draft: string) => void;
  onSave: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaved?: (name: string) => void;
};

export function OverviewNameEditor({
  value,
  entityLabel,
  resetKey,
  autoEdit = false,
  renameFocusRequest = 0,
  onLeaveTitle,
  onDraftChange,
  onSave,
  onSaved,
}: OverviewNameEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasAutoEdited, setHasAutoEdited] = useState(false);

  const syncKey = `${resetKey ?? ""}|${value}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setDraft(value);
    setEditing(false);
    setError(null);
    setHasAutoEdited(false);
  }

  if (autoEdit && !hasAutoEdited) {
    setHasAutoEdited(true);
    setEditing(true);
    setError(null);
  }

  const [prevRenameFocusRequest, setPrevRenameFocusRequest] =
    useState(renameFocusRequest);
  if (renameFocusRequest !== prevRenameFocusRequest && renameFocusRequest) {
    setPrevRenameFocusRequest(renameFocusRequest);
    setEditing(true);
    setError(null);
  }

  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;

    const focusTitle = () => {
      // Don't interrupt typing if the title already has focus.
      if (document.activeElement === input) return;
      input.focus();
      input.select();
    };

    focusTitle();
    // Side-panel / pathname keyboard nav / delete-modal close can steal focus
    // after mount — re-assert across frames and short timeouts.
    const frame = requestAnimationFrame(() => {
      focusTitle();
      requestAnimationFrame(focusTitle);
    });
    const timers = [50, 150, 300].map((ms) =>
      window.setTimeout(focusTitle, ms),
    );
    return () => {
      cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [editing, renameFocusRequest]);

  function cancelEditing() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  function save() {
    const trimmed = draft.trim();
    setDraft(trimmed);

    if (trimmed === value) {
      setEditing(false);
      setError(null);
      return;
    }

    if (!trimmed) {
      setError(`${entityLabel} name is required.`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onSave(trimmed);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditing(false);
      onSaved?.(trimmed);
    });
  }

  function commitTitleAndLeave(reason: "enter" | "escape" | "tab") {
    const trimmed = draft.trim();
    setDraft(trimmed);

    if (!trimmed) {
      setError(`${entityLabel} name is required.`);
      return;
    }

    if (trimmed === value) {
      setEditing(false);
      setError(null);
      onLeaveTitle?.(reason);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onSave(trimmed);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditing(false);
      onSaved?.(trimmed);
      onLeaveTitle?.(reason);
    });
  }

  if (editing) {
    return (
      <div className="overview-name-editor">
        <h1 className={CONTENT_DETAIL_TITLE_CLASS}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              onDraftChange?.(next);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (onLeaveTitle) {
                  commitTitleAndLeave("enter");
                  return;
                }
                save();
              }
              if (event.key === "Tab" && !event.shiftKey && onLeaveTitle) {
                event.preventDefault();
                commitTitleAndLeave("tab");
              }
            }}
            onBlur={() => {
              if (!isPending) {
                save();
              }
            }}
            disabled={isPending}
            aria-label={`${entityLabel} name`}
            className="overview-name-editor__input"
          />
        </h1>
        {error ? (
          <p className="overview-name-editor__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overview-name-editor">
      <h1 className={CONTENT_DETAIL_TITLE_CLASS}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setEditing(true);
            setError(null);
          }}
          className="overview-name-editor__button"
          aria-label={`Edit ${entityLabel.toLowerCase()} name: ${value}`}
        >
          {value}
        </button>
      </h1>
      {error ? (
        <p className="overview-name-editor__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
