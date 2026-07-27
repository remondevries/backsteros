"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type DirectoryEntry = {
  name: string;
  path: string;
};

type DirectoryListing = {
  path: string;
  parent: string | null;
  home: string;
  entries: DirectoryEntry[];
  error?: string;
};

async function fetchDirectoryListing(
  directoryPath: string,
  signal?: AbortSignal,
): Promise<DirectoryListing> {
  const url = new URL("/api/fs/directories", window.location.origin);
  if (directoryPath.trim()) {
    url.searchParams.set("path", directoryPath.trim());
  }
  const response = await fetch(url, { signal });
  const data = (await response.json()) as DirectoryListing;
  if (!response.ok && !data.path) {
    throw new Error(data.error || "Could not list directory.");
  }
  return data;
}

function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.75 2.5A1.75 1.75 0 0 0 0 4.25v7.5C0 12.664.784 13.5 1.75 13.5h12.5c.966 0 1.75-.836 1.75-1.75v-5.5A1.75 1.75 0 0 0 14.25 4.5H8.06L6.78 2.78A.75.75 0 0 0 6.25 2.5H1.75Z" />
    </svg>
  );
}

function pathSegments(absolutePath: string): { label: string; path: string }[] {
  const parts = absolutePath.split("/").filter(Boolean);
  const segments: { label: string; path: string }[] = [];
  if (absolutePath.startsWith("/")) {
    segments.push({ label: "/", path: "/" });
  }
  let built = "";
  for (const part of parts) {
    built = `${built}/${part}`;
    segments.push({ label: part, path: built });
  }
  return segments;
}

export function DirectoryPickerModal({
  open,
  initialPath,
  onClose,
  onSelect,
}: {
  open: boolean;
  initialPath?: string | null;
  onClose: () => void;
  onSelect: (directory: string) => void;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const load = useCallback((directoryPath: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setHighlighted(null);
    return fetchDirectoryListing(directoryPath, signal)
      .then((next) => {
        if (signal?.aborted) return;
        setListing(next);
        if (next.error) setError(next.error);
      })
      .catch((loadError: unknown) => {
        if (signal?.aborted) return;
        if ((loadError as { name?: string }).name === "AbortError") return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not list directory.",
        );
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(initialPath?.trim() || "", controller.signal);
    return () => controller.abort();
  }, [open, initialPath, load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (!listing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const ids = listing.entries.map((entry) => entry.path);
        if (ids.length === 0) return;
        const currentIndex = highlighted
          ? ids.indexOf(highlighted)
          : -1;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          currentIndex < 0
            ? event.key === "ArrowDown"
              ? 0
              : ids.length - 1
            : (currentIndex + delta + ids.length) % ids.length;
        setHighlighted(ids[nextIndex]!);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (highlighted) {
          void load(highlighted);
        } else if (listing.path) {
          onSelect(listing.path);
          onClose();
        }
        return;
      }
      if (event.key === "Backspace" && listing.parent) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        void load(listing.parent);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [highlighted, listing, load, onClose, onSelect, open]);

  if (!open) return null;

  const currentPath = listing?.path ?? initialPath?.trim() ?? "";
  const segments = currentPath ? pathSegments(currentPath) : [];

  return createPortal(
    <div className="directory-picker-root" data-blocking-modal="">
      <button
        type="button"
        className="directory-picker-backdrop"
        aria-label="Close directory picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="directory-picker-dialog"
      >
        <div className="directory-picker-header">
          <h2 id={titleId} className="directory-picker-title">
            Choose directory
          </h2>
          <div className="directory-picker-toolbar">
            <button
              type="button"
              className="console-btn"
              disabled={!listing?.parent || loading}
              onClick={() => listing?.parent && void load(listing.parent)}
              title="Go up"
              aria-label="Go to parent directory"
            >
              ↑
            </button>
            <button
              type="button"
              className="console-btn"
              disabled={loading || !listing?.home}
              onClick={() => listing?.home && void load(listing.home)}
              title="Home"
              aria-label="Go to home directory"
            >
              Home
            </button>
            <nav className="directory-picker-crumbs" aria-label="Path">
              {segments.map((segment, index) => (
                <span key={segment.path} className="directory-picker-crumb">
                  {index > 0 ? (
                    <span className="directory-picker-crumb-sep">/</span>
                  ) : null}
                  <button
                    type="button"
                    className="directory-picker-crumb-btn"
                    disabled={loading || segment.path === currentPath}
                    onClick={() => void load(segment.path)}
                  >
                    {segment.label === "/" ? "Disk" : segment.label}
                  </button>
                </span>
              ))}
            </nav>
          </div>
        </div>

        <div className="directory-picker-body" ref={listRef}>
          {loading && !listing ? (
            <div className="directory-picker-empty">Loading…</div>
          ) : null}
          {error ? (
            <div className="directory-picker-error" role="alert">
              {error}
            </div>
          ) : null}
          {listing && listing.entries.length === 0 && !loading ? (
            <div className="directory-picker-empty">No subfolders here</div>
          ) : null}
          {listing ? (
            <ul className="directory-picker-list" role="listbox">
              {listing.entries.map((entry) => {
                const isHighlighted = highlighted === entry.path;
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      className={`directory-picker-item${
                        isHighlighted ? " is-highlighted" : ""
                      }`}
                      onClick={() => setHighlighted(entry.path)}
                      onDoubleClick={() => void load(entry.path)}
                    >
                      <FolderIcon />
                      <span className="directory-picker-item-name">
                        {entry.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="directory-picker-footer">
          <p className="directory-picker-current" title={currentPath}>
            {currentPath || "—"}
          </p>
          <div className="directory-picker-actions">
            <button type="button" className="console-btn" onClick={onClose}>
              Cancel
            </button>
            {highlighted ? (
              <button
                type="button"
                className="console-btn"
                disabled={loading}
                onClick={() => void load(highlighted)}
              >
                Open
              </button>
            ) : null}
            <button
              type="button"
              className="console-btn console-btn--primary"
              disabled={!currentPath || loading}
              onClick={() => {
                if (!currentPath) return;
                onSelect(currentPath);
                onClose();
              }}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
