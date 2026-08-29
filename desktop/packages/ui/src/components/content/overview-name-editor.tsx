"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";

import { CONTENT_DETAIL_TITLE_CLASS } from "./content-detail-title-header.js";
import { ENTITY_TITLE_INPUT_ATTRIBUTE } from "../../list-nav/use-list-clear-selection-shortcut.js";

/** "First name" stays as-is; "Task" becomes "Task name". */
function entityNamePhrase(entityLabel: string): string {
  return /\bname$/i.test(entityLabel.trim())
    ? entityLabel.trim()
    : `${entityLabel} name`;
}

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
  /** Override the title heading class (default: content-detail title). */
  titleClassName?: string;
  /** When set (and not editing), replaces the plain title label. */
  highlightContent?: ReactNode;
  /** Called when the user starts editing (e.g. clear spellcheck highlights). */
  onBeginEdit?: () => void;
  /** When true, empty values are allowed (e.g. contact last name). */
  allowEmpty?: boolean;
  /**
   * Shrink-wrap the editing input to the typed text (contact first/last name
   * side-by-side). Full-bleed titles leave this off.
   */
  fitContent?: boolean;
  onSave: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaved?: (name: string) => void;
};

type NameInputProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  draft: string;
  entityLabel: string;
  isPending: boolean;
  onDraftChange?: (draft: string) => void;
  setDraft: (next: string) => void;
  setError: (error: string | null) => void;
  cancelEditing: () => void;
  save: () => void;
  commitTitleAndLeave: (reason: "enter" | "escape" | "tab") => void;
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  /** Optional HTML size attr — keep at 1 when a sizer span owns width. */
  size?: number;
};

function NameInput({
  inputRef,
  draft,
  entityLabel,
  isPending,
  onDraftChange,
  setDraft,
  setError,
  cancelEditing,
  save,
  commitTitleAndLeave,
  onLeaveTitle,
  size,
}: NameInputProps) {
  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      size={size}
      {...{ [ENTITY_TITLE_INPUT_ATTRIBUTE]: "" }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onDraftChange?.(next);
        setError(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
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
      aria-label={entityNamePhrase(entityLabel)}
      className="overview-name-editor__input"
    />
  );
}

export function OverviewNameEditor({
  value,
  entityLabel,
  resetKey,
  autoEdit = false,
  renameFocusRequest = 0,
  onLeaveTitle,
  onDraftChange,
  titleClassName = CONTENT_DETAIL_TITLE_CLASS,
  highlightContent,
  onBeginEdit,
  allowEmpty = false,
  fitContent = false,
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
      if (allowEmpty) {
        if (value === "") {
          setEditing(false);
          setError(null);
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await onSave("");
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setEditing(false);
          onSaved?.("");
        });
        return;
      }
      setError(`${entityNamePhrase(entityLabel)} is required.`);
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
      if (allowEmpty) {
        if (value !== "") {
          startTransition(async () => {
            setError(null);
            const result = await onSave("");
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setEditing(false);
            onSaved?.("");
            onLeaveTitle?.(reason);
          });
          return;
        }
        setEditing(false);
        setError(null);
        onLeaveTitle?.(reason);
        return;
      }
      setError(`${entityNamePhrase(entityLabel)} is required.`);
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

  const editorClassName = fitContent
    ? "overview-name-editor overview-name-editor--fit-content"
    : "overview-name-editor";

  const inputProps: NameInputProps = {
    inputRef,
    draft,
    entityLabel,
    isPending,
    onDraftChange,
    setDraft,
    setError,
    cancelEditing,
    save,
    commitTitleAndLeave,
    onLeaveTitle,
  };

  if (editing) {
    const sizerText = draft.length > 0 ? draft : entityLabel;
    return (
      <div className={editorClassName}>
        <h1 className={titleClassName}>
          {fitContent ? (
            <span className="overview-name-editor__fit">
              {/* Sizer drives width; input fills it. Inputs ignore width:auto. */}
              <span className="overview-name-editor__sizer" aria-hidden="true">
                {sizerText || "\u00a0"}
              </span>
              <NameInput {...inputProps} size={1} />
            </span>
          ) : (
            <NameInput {...inputProps} />
          )}
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
    <div className={editorClassName}>
      <h1 className={titleClassName}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            onBeginEdit?.();
            setEditing(true);
            setError(null);
          }}
          className="overview-name-editor__button"
          aria-label={`Edit ${entityNamePhrase(entityLabel).toLowerCase()}: ${value}`}
        >
          {highlightContent ??
            (value ||
              (allowEmpty || fitContent ? (
                <span className="overview-name-editor__placeholder">
                  {entityLabel}
                </span>
              ) : (
                value
              )))}
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
