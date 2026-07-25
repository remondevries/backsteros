"use client";

import { ComposeFolderIcon } from "@backsteros/ui";
import { useEffect, useRef, useState, useTransition } from "react";

function FileIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.75 1A1.75 1.75 0 0 0 1 2.75v10.5C1 14.216 1.784 15 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V6.5a.75.75 0 0 0-.22-.53l-4.75-4.75A.75.75 0 0 0 9.5 1H2.75Zm6.75 1.56L13.44 6.5H10.25A1.75 1.75 0 0 1 9.5 5.75V2.56Z" />
    </svg>
  );
}

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
          <FileIcon />
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
            // Unmount / focus-clear often has a null relatedTarget — don't
            // treat that as "click away" or the field vanishes immediately.
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
