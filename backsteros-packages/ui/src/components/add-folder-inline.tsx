"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type AddFolderInlineProps = {
  onCancel: () => void;
  onSubmit: (
    name: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function AddFolderInline({ onCancel, onSubmit }: AddFolderInlineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await onSubmit(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCancel();
    });
  }

  return (
    <form
      className="app-side-panel-add-folder"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
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
          if (!isPending) submit();
        }}
        disabled={isPending}
        placeholder="Folder name"
        aria-label="Folder name"
        className="app-side-panel-add-folder-input"
      />
      {error ? (
        <p className="app-side-panel-tree-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
