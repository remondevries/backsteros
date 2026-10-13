import { useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

import "./overview-name-editor.css";

function stripNewlines(text: string): string {
  return text.replace(/[\n\r\u2028\u2029]/g, "");
}

function resizeTitleField(el: HTMLTextAreaElement) {
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

export type BacksterosOverviewNameEditorProps = {
  readonly value: string;
  readonly entityLabel?: string;
  readonly resetKey?: string;
  /** Start in edit mode (create-task empty title). */
  readonly autoEdit?: boolean;
  /** Increment to enter edit mode and focus/select the title field. */
  readonly renameFocusRequest?: number;
  readonly titleClassName?: string;
  readonly placeholder?: string | undefined;
  readonly allowEmpty?: boolean;
  readonly onSave: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  /** Live draft updates for compose flows that keep an external draft. */
  readonly onDraftChange?: (draft: string) => void;
  readonly highlightContent?: ReactNode;
};

/**
 * Desktop-parity title editor: borderless inline field, click-to-edit,
 * Enter/blur commits, Escape cancels. No Cancel/Save chrome.
 * Uses a wrapping textarea so edit layout matches the multi-line view.
 */
export function BacksterosOverviewNameEditor({
  value,
  entityLabel = "Task",
  resetKey,
  autoEdit = false,
  renameFocusRequest = 0,
  titleClassName = "bos-overview-name-editor__title text-[17px] font-semibold leading-[1.3] tracking-[-0.02em]",
  placeholder,
  allowEmpty = false,
  onSave,
  onDraftChange,
  highlightContent,
}: BacksterosOverviewNameEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    setEditing(autoEdit);
    setError(null);
    setHasAutoEdited(false);
  }

  if (autoEdit && !hasAutoEdited) {
    setHasAutoEdited(true);
    setEditing(true);
    setError(null);
  }

  const [prevRenameFocusRequest, setPrevRenameFocusRequest] = useState(renameFocusRequest);
  if (renameFocusRequest !== prevRenameFocusRequest && renameFocusRequest) {
    setPrevRenameFocusRequest(renameFocusRequest);
    setEditing(true);
    setError(null);
  }

  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;

    resizeTitleField(input);

    const focusTitle = () => {
      if (document.activeElement === input) return;
      input.focus();
      input.select();
    };

    focusTitle();
    const frame = requestAnimationFrame(() => {
      resizeTitleField(input);
      focusTitle();
      requestAnimationFrame(focusTitle);
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    resizeTitleField(input);
  }, [draft, editing]);

  function cancelEditing() {
    setDraft(value);
    onDraftChange?.(value);
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
          if (result.ok === false) {
            setError(result.error);
            return;
          }
          setEditing(false);
        });
        return;
      }
      setError(`${entityLabel} name is required.`);
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
    });
  }

  const phrase = /\b(name|title)$/i.test(entityLabel.trim())
    ? entityLabel.trim()
    : `${entityLabel.trim()} name`;

  if (editing) {
    return (
      <div className="bos-overview-name-editor">
        <h1 className={titleClassName}>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={isPending}
            aria-label={phrase}
            placeholder={placeholder ?? entityLabel}
            onChange={(event) => {
              const next = stripNewlines(event.target.value);
              setDraft(next);
              onDraftChange?.(next);
              setError(null);
              resizeTitleField(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelEditing();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            onBlur={() => {
              if (!isPending) save();
            }}
            className="bos-overview-name-editor__input"
          />
        </h1>
        {error ? (
          <p className="bos-overview-name-editor__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bos-overview-name-editor">
      <h1 className={titleClassName}>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setError(null);
          }}
          className="bos-overview-name-editor__button"
          aria-label={`Edit ${phrase.toLowerCase()}: ${value}`}
        >
          {highlightContent ??
            (value || (
              <span className="bos-overview-name-editor__placeholder">
                {placeholder ?? entityLabel}
              </span>
            ))}
        </button>
      </h1>
      {error ? (
        <p className="bos-overview-name-editor__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
