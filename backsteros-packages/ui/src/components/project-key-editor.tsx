"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  isValidProjectKey,
  normalizeProjectKey,
} from "../project-key.js";

export type ProjectKeyEditorProps = {
  value: string;
  onSave: (
    key: string,
  ) =>
    | Promise<{ ok: true; key?: string } | { ok: false; error: string }>
    | { ok: true; key?: string }
    | { ok: false; error: string };
};

/**
 * Inline project ID (key) editor — click pill to edit, Enter/blur to save.
 * Mirrors Next `ProjectOverviewKeyEditor`.
 */
export function ProjectKeyEditor({ value, onSave }: ProjectKeyEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const syncKey = value;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function cancelEditing() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  function save() {
    const normalized = normalizeProjectKey(draft);
    setDraft(normalized);

    if (normalized === value) {
      setEditing(false);
      setError(null);
      return;
    }

    if (!isValidProjectKey(normalized)) {
      setError("Use 2–6 letters or numbers.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onSave(normalized);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="project-detail__key-editor">
        <span className="project-detail__key project-detail__key--editing">
          <span className="project-detail__key-label">ID</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => {
              setDraft(normalizeProjectKey(event.target.value));
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            onBlur={() => {
              if (!isPending) {
                save();
              }
            }}
            disabled={isPending}
            maxLength={6}
            aria-label="Project ID"
            className="project-detail__key-input"
          />
        </span>
        {error ? (
          <p className="project-detail__key-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="project-detail__key-editor">
      <button
        type="button"
        className="project-detail__key-button"
        onClick={() => {
          setEditing(true);
          setError(null);
        }}
        aria-label={`Edit project ID: ${value}`}
      >
        <span className="project-detail__key">
          <span className="project-detail__key-label">ID</span>
          <span className="project-detail__key-value">{value}</span>
        </span>
      </button>
      {error ? (
        <p className="project-detail__key-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
