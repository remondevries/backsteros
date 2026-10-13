"use client";

import type {
  LocationFsListResponse,
  LocationFsTarget,
} from "@backsteros/contracts";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { ComposeFolderIcon } from "../compose/compose-folder-icon.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./codebase-request-json.js";

export type LocationFolderPickerProps = {
  open: boolean;
  target: LocationFsTarget;
  title: string;
  initialPath?: string | null;
  /** Required when target=local — jail is Projects/{key}/… */
  projectId?: string | null;
  requestJson: CodebaseRequestJson;
  onSelect: (path: string) => void;
  onClose: () => void;
};

function pathSegments(absolute: string, base: string): string[] {
  const baseTrimmed = base.replace(/\/+$/, "") || "/";
  const trimmed = absolute.replace(/\/+$/, "") || baseTrimmed;
  if (trimmed === baseTrimmed) return [];
  const rest = trimmed.startsWith(`${baseTrimmed}/`)
    ? trimmed.slice(baseTrimmed.length + 1)
    : trimmed.replace(/^\//, "");
  return rest.split("/").filter(Boolean);
}

export function LocationFolderPicker({
  open,
  target,
  title,
  initialPath,
  projectId,
  requestJson,
  onSelect,
  onClose,
}: LocationFolderPickerProps) {
  const titleId = useId();
  const [listing, setListing] = useState<LocationFsListResponse | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(
    initialPath?.trim() || null,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialPath?.trim() || null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualPath, setManualPath] = useState(initialPath?.trim() ?? "");

  const load = useCallback(
    async (path: string | null | undefined) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ target });
        if (path?.trim()) query.set("path", path.trim());
        if (target === "local" && projectId?.trim()) {
          query.set("projectId", projectId.trim());
        }
        const result = await requestJson<LocationFsListResponse>(
          `/api/v1/location-fs?${query.toString()}`,
        );
        setListing(result);
        setCurrentPath(result.path);
        setSelectedPath(result.path);
      } catch (err) {
        setError(apiErrorMessage(err) || "Could not list folders.");
        setListing(null);
      } finally {
        setLoading(false);
      }
    },
    [projectId, requestJson, target],
  );

  useEffect(() => {
    if (!open) return;
    setManualMode(false);
    setShowCreate(false);
    setNewFolderName("");
    setManualPath(initialPath?.trim() ?? "");
    void load(initialPath?.trim() || null);
  }, [open, initialPath, load]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const base = listing?.base ?? "";
  const crumbs = listing ? pathSegments(listing.path, listing.base) : [];

  return createPortal(
    <div
      className="location-folder-picker"
      data-blocking-modal=""
      data-location-folder-picker=""
    >
      <button
        type="button"
        aria-label="Close folder picker"
        className="location-folder-picker__backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="location-folder-picker__panel"
      >
        <header className="location-folder-picker__header">
          <h2 id={titleId} className="location-folder-picker__title">
            {title}
          </h2>
        </header>

        {manualMode ? (
          <div className="location-folder-picker__manual">
            <label className="location-folder-picker__manual-label">
              Absolute path
              <input
                autoFocus
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="/absolute/path"
                className="location-folder-picker__manual-input"
                aria-label="Type or paste absolute path"
              />
            </label>
            <p className="location-folder-picker__hint">
              Paste a path if you already know it. It should stay under{" "}
              {base || "the allowed base"}.
            </p>
          </div>
        ) : (
          <>
            <p className="location-folder-picker__path" title={currentPath ?? ""}>
              {currentPath ?? "…"}
            </p>

            <nav
              className="location-folder-picker__crumbs"
              aria-label="Current path"
            >
              <button
                type="button"
                className="location-folder-picker__crumb"
                disabled={loading || !listing}
                onClick={() => void load(base || null)}
                title={base}
              >
                {base ? base.split("/").filter(Boolean).pop() || base : "…"}
              </button>
              {crumbs.map((segment, index) => {
                const crumbPath = `${base.replace(/\/+$/, "")}/${crumbs
                  .slice(0, index + 1)
                  .join("/")}`;
                return (
                  <span key={crumbPath} className="location-folder-picker__crumb-wrap">
                    <span aria-hidden="true" className="location-folder-picker__crumb-sep">
                      /
                    </span>
                    <button
                      type="button"
                      className="location-folder-picker__crumb"
                      disabled={loading}
                      onClick={() => void load(crumbPath)}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </nav>

            <div className="location-folder-picker__toolbar">
              <button
                type="button"
                className="location-folder-picker__tool"
                disabled={loading || !listing?.writable}
                onClick={() => {
                  setShowCreate((openCreate) => !openCreate);
                  setNewFolderName("");
                }}
              >
                New folder
              </button>
            </div>

            {showCreate ? (
              <form
                className="location-folder-picker__create"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!listing || !newFolderName.trim() || creating) return;
                  void (async () => {
                    setCreating(true);
                    setError(null);
                    try {
                      const created = await requestJson<{ path: string }>(
                        "/api/v1/location-fs/folders",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            target,
                            parent: listing.path,
                            name: newFolderName.trim(),
                            ...(target === "local" && projectId?.trim()
                              ? { projectId: projectId.trim() }
                              : {}),
                          }),
                        },
                      );
                      setShowCreate(false);
                      setNewFolderName("");
                      await load(created.path);
                    } catch (err) {
                      setError(
                        apiErrorMessage(err) || "Could not create folder.",
                      );
                    } finally {
                      setCreating(false);
                    }
                  })();
                }}
              >
                <input
                  autoFocus
                  value={newFolderName}
                  disabled={creating}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="Folder name"
                  aria-label="New folder name"
                  className="location-folder-picker__create-input"
                />
                <button
                  type="submit"
                  disabled={creating || !newFolderName.trim()}
                  className="location-folder-picker__tool"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </form>
            ) : null}

            <div className="location-folder-picker__list" role="listbox" aria-label="Folders">
              {loading ? (
                <p className="location-folder-picker__empty">Loading…</p>
              ) : listing?.entries.length ? (
                listing.entries.map((entry) => {
                  const selected = selectedPath === entry.path;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={[
                        "location-folder-picker__row",
                        selected ? "is-selected" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => void load(entry.path)}
                    >
                      <span className="location-folder-picker__row-icon" aria-hidden="true">
                        <ComposeFolderIcon className="" />
                      </span>
                      <span className="location-folder-picker__row-label">
                        {entry.name}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="location-folder-picker__empty">
                  {listing?.exists
                    ? "No subfolders here."
                    : "This path does not exist yet."}
                </p>
              )}
            </div>
          </>
        )}

        {error ? (
          <p className="location-folder-picker__error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="location-folder-picker__footer">
          <button
            type="button"
            className="location-folder-picker__secondary"
            onClick={() => {
              if (manualMode) {
                setManualMode(false);
                void load(manualPath.trim() || initialPath?.trim() || null);
              } else {
                setManualMode(true);
                setManualPath(selectedPath ?? currentPath ?? "");
              }
            }}
          >
            {manualMode ? "Browse folders" : "Type / paste path"}
          </button>
          <div className="location-folder-picker__footer-actions">
            <button
              type="button"
              className="location-folder-picker__secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="location-folder-picker__primary"
              disabled={
                manualMode
                  ? !manualPath.trim()
                  : !selectedPath?.trim() || loading
              }
              onClick={() => {
                const next = manualMode
                  ? manualPath.trim()
                  : selectedPath?.trim() ?? "";
                if (!next) return;
                onSelect(next);
              }}
            >
              Select
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
