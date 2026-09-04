"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react";

import { CONTENT_DETAIL_TITLE_CLASS } from "./content-detail-title-header.js";
import { ENTITY_TITLE_INPUT_ATTRIBUTE } from "../../list-nav/use-list-clear-selection-shortcut.js";

/** "First name" / "Job title" stay as-is; "Task" becomes "Task name". */
function entityNamePhrase(entityLabel: string): string {
  const trimmed = entityLabel.trim();
  if (/\b(name|title)$/i.test(trimmed)) return trimmed;
  return `${trimmed} name`;
}

function stripNewlines(text: string): string {
  return text.replace(/[\n\r\u2028\u2029]/g, "");
}

function selectAllContents(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
  /**
   * Wrapper element around the editable control. Contact job titles use
   * `span` so they sit in the subtitle row without an extra heading.
   */
  as?: ElementType;
  /** When set (and not editing), replaces the plain title label. */
  highlightContent?: ReactNode;
  /** Called when the user starts editing (e.g. clear spellcheck highlights). */
  onBeginEdit?: () => void;
  /** When true, empty values are allowed (e.g. contact last name / title). */
  allowEmpty?: boolean;
  /**
   * Shrink-wrap to typed text via contenteditable (contact first/last name
   * and job title). Full-bleed titles leave this off and use a normal input.
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
}: NameInputProps) {
  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
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

type FitEditableProps = {
  editableRef: RefObject<HTMLSpanElement | null>;
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
};

/**
 * Content-sized flat text editor. Uses contenteditable so width tracks glyphs
 * naturally — avoids the UA &lt;input&gt; intrinsic-min / sizer desync that clips
 * last names.
 */
function FitContentEditable({
  editableRef,
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
}: FitEditableProps) {
  function syncFromDom(el: HTMLSpanElement) {
    const raw = el.textContent ?? "";
    const cleaned = stripNewlines(raw);
    if (cleaned !== raw) {
      el.textContent = cleaned;
      placeCaretAtEnd(el);
    }
    setDraft(cleaned);
    onDraftChange?.(cleaned);
    setError(null);
  }

  return (
    <span
      ref={editableRef}
      role="textbox"
      aria-multiline="false"
      aria-label={entityNamePhrase(entityLabel)}
      aria-placeholder={entityLabel}
      data-placeholder={entityLabel}
      data-empty={draft.length === 0 ? "" : undefined}
          contentEditable={
            isPending ? false : ("plaintext-only" as "plaintext-only")
          }
      suppressContentEditableWarning
      {...{ [ENTITY_TITLE_INPUT_ATTRIBUTE]: "" }}
      className="overview-name-editor__fit-editable"
      onInput={(event) => {
        syncFromDom(event.currentTarget);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = stripNewlines(
          event.clipboardData.getData("text/plain") || "",
        );
        const el = event.currentTarget;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          el.textContent = `${el.textContent ?? ""}${text}`;
          syncFromDom(el);
          placeCaretAtEnd(el);
          return;
        }
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        syncFromDom(el);
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
          return;
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
  as: TitleTag = "h1",
  highlightContent,
  onBeginEdit,
  allowEmpty = false,
  fitContent = false,
  onSave,
  onSaved,
}: OverviewNameEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editableRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasAutoEdited, setHasAutoEdited] = useState(false);
  /** Seed contenteditable once per edit session — avoid resetting caret. */
  const fitSeededRef = useRef(false);

  const syncKey = `${resetKey ?? ""}|${value}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setDraft(value);
    setEditing(false);
    setError(null);
    setHasAutoEdited(false);
    fitSeededRef.current = false;
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
    fitSeededRef.current = false;
  }

  useLayoutEffect(() => {
    if (!editing) {
      fitSeededRef.current = false;
      return;
    }

    if (fitContent) {
      const el = editableRef.current;
      if (!el) return;

      if (!fitSeededRef.current) {
        el.textContent = value;
        setDraft(value);
        fitSeededRef.current = true;
      }

      const focusFit = () => {
        if (document.activeElement === el) return;
        el.focus();
        selectAllContents(el);
      };

      focusFit();
      const frame = requestAnimationFrame(() => {
        focusFit();
        requestAnimationFrame(focusFit);
      });
      const timers = [50, 150, 300].map((ms) =>
        window.setTimeout(focusFit, ms),
      );
      return () => {
        cancelAnimationFrame(frame);
        for (const timer of timers) window.clearTimeout(timer);
      };
    }

    const input = inputRef.current;
    if (!input) return;

    const focusTitle = () => {
      if (document.activeElement === input) return;
      input.focus();
      input.select();
    };

    focusTitle();
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
  }, [editing, fitContent, renameFocusRequest, value]);

  function cancelEditing() {
    setDraft(value);
    setEditing(false);
    setError(null);
    fitSeededRef.current = false;
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
          if (result.ok === false) {
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

      if (result.ok === false) {
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
            if (result.ok === false) {
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

      if (result.ok === false) {
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
    return (
      <div className={editorClassName}>
        <TitleTag className={titleClassName}>
          {fitContent ? (
            <FitContentEditable
              editableRef={editableRef}
              draft={draft}
              entityLabel={entityLabel}
              isPending={isPending}
              onDraftChange={onDraftChange}
              setDraft={setDraft}
              setError={setError}
              cancelEditing={cancelEditing}
              save={save}
              commitTitleAndLeave={commitTitleAndLeave}
              onLeaveTitle={onLeaveTitle}
            />
          ) : (
            <NameInput {...inputProps} />
          )}
        </TitleTag>
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
      <TitleTag className={titleClassName}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            onBeginEdit?.();
            fitSeededRef.current = false;
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
      </TitleTag>
      {error ? (
        <p className="overview-name-editor__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
