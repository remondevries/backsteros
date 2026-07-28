"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ComposeFolderIcon } from "../compose-folder-icon.js";
import { FileTypeIcon } from "../file-type-icon.js";

export function FsTreeInlineCreate({
  kind,
  depth,
  onCancel,
  onSubmit,
}: {
  kind: "file" | "directory";
  depth: number;
  onCancel: () => void;
  onSubmit: (
    name: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
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
    <li className="console-fs-tree-item console-fs-tree-item--create" role="none">
      <form
        className="console-fs-tree-create"
        style={{ paddingLeft: 8 + depth * 14 }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="console-fs-tree-chevron-spacer" aria-hidden="true" />
        {kind === "directory" ? (
          <ComposeFolderIcon className="console-fs-tree-icon" />
        ) : (
          <FileTypeIcon
            pathValue={name.trim() || "untitled"}
            className="console-fs-tree-icon console-fs-tree-file-type-icon"
          />
        )}
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          onBlur={(event) => {
            if (isPending) return;
            if (event.relatedTarget == null && !name.trim()) {
              return;
            }
            submit();
          }}
          disabled={isPending}
          placeholder={kind === "directory" ? "Folder name" : "File name"}
          aria-label={kind === "directory" ? "Folder name" : "File name"}
          className="console-fs-tree-create-input"
        />
      </form>
      {error ? (
        <p
          className="console-fs-tree-status is-error"
          style={{ paddingLeft: 24 + depth * 14 }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}
