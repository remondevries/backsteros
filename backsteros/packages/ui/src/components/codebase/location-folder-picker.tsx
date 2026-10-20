"use client";

import type {
  LocationFsListResponse,
  LocationFsTarget,
} from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ComposeFolderIcon } from "../compose/compose-folder-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
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

function remoteServerLabel(target: LocationFsTarget): string | null {
  if (target === "development") return "development server";
  if (target === "production") return "production server";
  return null;
}

function locationSchemeLabel(target: LocationFsTarget): string {
  if (target === "development") return "Development";
  if (target === "production") return "Production";
  return "Local";
}

/** Strip leading `/` so `Scheme://` + path does not render as `Scheme:///…`. */
function locationPathWithoutRootSlash(absolutePath: string): string {
  return absolutePath.replace(/^\/+/, "") || absolutePath;
}

/**
 * Split a base path into a non-link parent prefix and the jail leaf name
 * (e.g. `home/deploy/` + `Projects`).
 */
function splitBasePathDisplay(absoluteBase: string): {
  parentPrefix: string;
  leafName: string;
} {
  const withoutRoot = locationPathWithoutRootSlash(absoluteBase);
  const parts = withoutRoot.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { parentPrefix: "", leafName: withoutRoot || "…" };
  }
  const leafName = parts[parts.length - 1] ?? withoutRoot;
  const parentParts = parts.slice(0, -1);
  const parentPrefix =
    parentParts.length > 0 ? `${parentParts.join("/")}/` : "";
  return { parentPrefix, leafName };
}

function formatLocationDisplayPath(
  target: LocationFsTarget,
  absolutePath: string | null | undefined,
): string {
  const scheme = locationSchemeLabel(target);
  const path = absolutePath?.trim();
  return path
    ? `${scheme}://${locationPathWithoutRootSlash(path)}`
    : `${scheme}://…`;
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
    setListing(null);
    setLoading(true);
    setCurrentPath(initialPath?.trim() || null);
    setSelectedPath(initialPath?.trim() || null);
    setError(null);
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
  const serverLabel = remoteServerLabel(target);
  const showRemoteGate = Boolean(serverLabel) && !listing && !manualMode;

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
        aria-label={title}
        className="location-folder-picker__panel"
      >
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
        ) : showRemoteGate ? (
          <>
            <p className="location-folder-picker__path">
              <span className="location-folder-picker__path-scheme">
                {locationSchemeLabel(target)}://
              </span>
              <span className="location-folder-picker__path-current">…</span>
            </p>
            <div
              className="location-folder-picker__connecting"
              role="status"
              aria-live="polite"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span
                    className="location-folder-picker__connecting-spinner"
                    aria-hidden="true"
                  />
                  <p className="location-folder-picker__connecting-title">
                    Connecting to {serverLabel}…
                  </p>
                  <p className="location-folder-picker__connecting-hint">
                    Folder browser will appear once the connection is ready.
                  </p>
                </>
              ) : (
                <>
                  <p className="location-folder-picker__connecting-title">
                    Couldn’t connect to {serverLabel}
                  </p>
                  <p className="location-folder-picker__connecting-hint">
                    {error ?? "Check the server and try again."}
                  </p>
                  <button
                    type="button"
                    className="location-folder-picker__tool"
                    onClick={() => void load(initialPath?.trim() || null)}
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <nav
              className="location-folder-picker__path"
              aria-label="Current path"
              title={formatLocationDisplayPath(target, currentPath)}
            >
              <span className="location-folder-picker__path-scheme">
                {locationSchemeLabel(target)}://
              </span>
              {listing ? (
                <>
                  {(() => {
                    const { parentPrefix, leafName } = splitBasePathDisplay(
                      base || "",
                    );
                    const atBase = crumbs.length === 0;
                    return (
                      <>
                        {parentPrefix ? (
                          <span className="location-folder-picker__path-parent">
                            {parentPrefix}
                          </span>
                        ) : null}
                        {atBase ? (
                          <span className="location-folder-picker__path-current">
                            {leafName}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="location-folder-picker__path-segment"
                            disabled={loading}
                            onClick={() => void load(base || null)}
                            title={base}
                          >
                            {leafName}
                          </button>
                        )}
                      </>
                    );
                  })()}
                  {crumbs.map((segment, index) => {
                    const crumbPath = `${base.replace(/\/+$/, "")}/${crumbs
                      .slice(0, index + 1)
                      .join("/")}`;
                    const isLast = index === crumbs.length - 1;
                    return (
                      <span
                        key={crumbPath}
                        className="location-folder-picker__path-segment-wrap"
                      >
                        <span
                          aria-hidden="true"
                          className="location-folder-picker__path-sep"
                        >
                          /
                        </span>
                        {isLast ? (
                          <span className="location-folder-picker__path-current">
                            {segment}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="location-folder-picker__path-segment"
                            disabled={loading}
                            onClick={() => void load(crumbPath)}
                          >
                            {segment}
                          </button>
                        )}
                      </span>
                    );
                  })}
                </>
              ) : (
                <span className="location-folder-picker__path-current">…</span>
              )}
            </nav>

            <div className="location-folder-picker__browser">
              <div className="location-folder-picker__list-header">
                <span className="location-folder-picker__list-header-label">
                  Name
                </span>
                <button
                  type="button"
                  className="location-folder-picker__list-header-add"
                  disabled={loading || !listing?.writable}
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => {
                    setShowCreate((openCreate) => !openCreate);
                    setNewFolderName("");
                  }}
                >
                  <SidePanelPlusIcon />
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

              <div
                className="location-folder-picker__list"
                role="listbox"
                aria-label="Folders"
              >
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
                        <span
                          className="location-folder-picker__row-icon"
                          aria-hidden="true"
                        >
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
            </div>
          </>
        )}

        {!showRemoteGate ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
