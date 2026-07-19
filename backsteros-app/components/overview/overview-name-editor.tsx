"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";

import { CONTENT_DETAIL_TITLE_CLASS } from "@/components/content/content-detail-title-header";

type OverviewNameEditorProps = {
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
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSaved?: (name: string) => void;
};

const titleClassName = CONTENT_DETAIL_TITLE_CLASS;

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
      <div className="flex flex-col gap-1">
        <h1 className={titleClassName}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              setError(null);
              onDraftChange?.(next);
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
            className="w-full border-none bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] outline-none placeholder:text-foreground/40 disabled:opacity-60"
          />
        </h1>
        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <h1 className={titleClassName}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setEditing(true);
            setError(null);
          }}
          className="inline-flex w-full cursor-text rounded-sm border-none bg-transparent p-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] text-inherit transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/20"
          aria-label={`Edit ${entityLabel.toLowerCase()} name: ${value}`}
        >
          {value}
        </button>
      </h1>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
