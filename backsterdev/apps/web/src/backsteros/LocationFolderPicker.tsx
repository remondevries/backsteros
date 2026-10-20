import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  createBacksterosLocationFsFolder,
  fetchBacksterosLocationFs,
  type BacksterosLocationFsList,
  type BacksterosLocationFsTarget,
} from "./client";
import { BacksterosComposeFolderIcon } from "./ComposeFolderIcon";
import { cn } from "~/lib/utils";

type Props = {
  readonly open: boolean;
  readonly target: BacksterosLocationFsTarget;
  readonly title: string;
  readonly initialPath?: string | null;
  /** Required when target=local — jail is Projects/{key}/… */
  readonly projectId?: string | null;
  readonly onSelect: (path: string) => void;
  readonly onClose: () => void;
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

function remoteServerLabel(target: BacksterosLocationFsTarget): string | null {
  if (target === "development") return "development server";
  if (target === "production") return "production server";
  return null;
}

function locationSchemeLabel(target: BacksterosLocationFsTarget): string {
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
  target: BacksterosLocationFsTarget,
  absolutePath: string | null | undefined,
): string {
  const scheme = locationSchemeLabel(target);
  const path = absolutePath?.trim();
  return path
    ? `${scheme}://${locationPathWithoutRootSlash(path)}`
    : `${scheme}://…`;
}

export function BacksterosLocationFolderPicker(props: Props) {
  const [listing, setListing] = useState<BacksterosLocationFsList | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    props.initialPath?.trim() || null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualPath, setManualPath] = useState(props.initialPath?.trim() ?? "");

  const load = useCallback(
    async (path: string | null | undefined) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchBacksterosLocationFs(
          props.target,
          path,
          props.projectId != null ? { projectId: props.projectId } : undefined,
        );
        setListing(result);
        setSelectedPath(result.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not list folders.");
        setListing(null);
      } finally {
        setLoading(false);
      }
    },
    [props.projectId, props.target],
  );

  useEffect(() => {
    if (!props.open) return;
    setListing(null);
    setLoading(true);
    setSelectedPath(props.initialPath?.trim() || null);
    setError(null);
    setManualMode(false);
    setShowCreate(false);
    setNewFolderName("");
    setManualPath(props.initialPath?.trim() ?? "");
    void load(props.initialPath?.trim() || null);
  }, [props.open, props.initialPath, load]);

  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props]);

  if (!props.open || typeof document === "undefined") return null;

  const base = listing?.base ?? "";
  const crumbs = listing ? pathSegments(listing.path, listing.base) : [];
  const serverLabel = remoteServerLabel(props.target);
  const showRemoteGate = Boolean(serverLabel) && !listing && !manualMode;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close folder picker"
        className="absolute inset-0 bg-black/60"
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="relative z-10 flex max-h-[min(640px,calc(100vh-48px))] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-2xl"
      >
        {manualMode ? (
          <div className="flex flex-col gap-2 px-4 pb-2 pt-3.5">
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              Absolute path
              <input
                autoFocus
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="/absolute/path"
                className="rounded-md border border-white/12 bg-[#0f0f0f] px-2 py-1.5 text-[13px] text-[#ededed]"
              />
            </label>
            <p className="m-0 text-xs text-white/45">
              Paste a path if you already know it. It should stay under {base || "the allowed base"}
              .
            </p>
          </div>
        ) : showRemoteGate ? (
          <>
            <p className="m-0 flex min-w-0 flex-wrap items-center px-4 pb-2 pt-3.5 text-[11px] text-white/55">
              <span className="shrink-0 text-white/55">
                {locationSchemeLabel(props.target)}://
              </span>
              <span className="text-white/70">…</span>
            </p>
            <div
              className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2.5 border-t border-white/8 bg-[#0c0c0c] px-5 py-7 text-center"
              role="status"
              aria-live="polite"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span
                    className="h-[22px] w-[22px] animate-spin rounded-full border-2 border-white/20 border-t-white/70"
                    aria-hidden="true"
                  />
                  <p className="m-0 text-[14px] font-medium text-white/90">
                    Connecting to {serverLabel}…
                  </p>
                  <p className="m-0 max-w-[28ch] text-[12px] leading-snug text-white/45">
                    Folder browser will appear once the connection is ready.
                  </p>
                </>
              ) : (
                <>
                  <p className="m-0 text-[14px] font-medium text-white/90">
                    Couldn’t connect to {serverLabel}
                  </p>
                  <p className="m-0 max-w-[28ch] text-[12px] leading-snug text-white/45">
                    {error ?? "Check the server and try again."}
                  </p>
                  <button
                    type="button"
                    className="mt-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[#ededed] hover:bg-white/[0.08]"
                    onClick={() => void load(props.initialPath?.trim() || null)}
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
              className="m-0 flex min-w-0 flex-wrap items-center px-4 pb-2 pt-3.5 text-[11px] text-white/55"
              aria-label="Current path"
              title={formatLocationDisplayPath(props.target, listing?.path)}
            >
              <span className="shrink-0 text-white/55">
                {locationSchemeLabel(props.target)}://
              </span>
              {listing ? (
                <>
                  {(() => {
                    const { parentPrefix, leafName } = splitBasePathDisplay(base || "");
                    const atBase = crumbs.length === 0;
                    return (
                      <>
                        {parentPrefix ? (
                          <span className="shrink-0 text-white/55">{parentPrefix}</span>
                        ) : null}
                        {atBase ? (
                          <span className="max-w-[16rem] truncate text-white/70">{leafName}</span>
                        ) : (
                          <button
                            type="button"
                            className="max-w-[16rem] truncate rounded-sm border-0 bg-transparent p-0 font-inherit text-[11px] text-sky-300 hover:underline disabled:opacity-50"
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
                    const crumbPath = `${base.replace(/\/+$/, "")}/${crumbs.slice(0, index + 1).join("/")}`;
                    const isLast = index === crumbs.length - 1;
                    return (
                      <span key={crumbPath} className="inline-flex min-w-0 items-center">
                        <span className="text-white/35" aria-hidden="true">
                          /
                        </span>
                        {isLast ? (
                          <span className="max-w-[16rem] truncate text-white/70">{segment}</span>
                        ) : (
                          <button
                            type="button"
                            className="max-w-[16rem] truncate rounded-sm border-0 bg-transparent p-0 font-inherit text-[11px] text-sky-300 hover:underline disabled:opacity-50"
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
                <span className="text-white/70">…</span>
              )}
            </nav>

            <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden border-t border-white/8 bg-[#0c0c0c]">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 py-1.5">
                <span className="text-[11px] font-medium tracking-wide text-white/55">
                  Name
                </span>
                <button
                  type="button"
                  className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border-0 bg-transparent text-white/70 hover:bg-white/[0.08] hover:text-[#ededed] disabled:cursor-default disabled:opacity-40"
                  disabled={loading || !listing?.writable}
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => {
                    setShowCreate((open) => !open);
                    setNewFolderName("");
                  }}
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <path
                      d="M6 2.5V9.5M2.5 6H9.5"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {showCreate ? (
                <form
                  className="flex shrink-0 gap-2 border-b border-white/8 px-4 py-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!listing || !newFolderName.trim() || creating) return;
                    void (async () => {
                      setCreating(true);
                      setError(null);
                      try {
                        const created = await createBacksterosLocationFsFolder({
                          target: props.target,
                          parent: listing.path,
                          name: newFolderName.trim(),
                          ...(props.projectId != null ? { projectId: props.projectId } : {}),
                        });
                        setShowCreate(false);
                        setNewFolderName("");
                        await load(created.path);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Could not create folder.");
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
                    className="min-w-0 flex-1 rounded-md border border-white/12 bg-[#0f0f0f] px-2 py-1.5 text-[13px] text-[#ededed]"
                  />
                  <button
                    type="submit"
                    disabled={creating || !newFolderName.trim()}
                    className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[#ededed] disabled:opacity-45"
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </form>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto p-1" role="listbox" aria-label="Folders">
                {loading ? (
                  <p className="m-6 text-center text-[13px] text-white/45">Loading…</p>
                ) : listing?.entries.length ? (
                  listing.entries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={selectedPath === entry.path}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#ededed] hover:bg-white/[0.06]",
                        selectedPath === entry.path && "bg-blue-500/25",
                      )}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => void load(entry.path)}
                    >
                      <BacksterosComposeFolderIcon size={14} />
                      <span className="min-w-0 truncate">{entry.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="m-6 text-center text-[13px] text-white/45">
                    {listing?.exists ? "No subfolders here." : "This path does not exist yet."}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {!showRemoteGate ? (
          <>
            {error ? (
              <p className="mx-4 mb-2 text-xs text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3">
              <button
                type="button"
                className="rounded-md border border-white/12 px-3 py-1.5 text-[13px] text-[#ededed] hover:bg-white/[0.06]"
                onClick={() => {
                  if (manualMode) {
                    setManualMode(false);
                    void load(manualPath.trim() || props.initialPath?.trim() || null);
                  } else {
                    setManualMode(true);
                    setManualPath(selectedPath ?? listing?.path ?? "");
                  }
                }}
              >
                {manualMode ? "Browse folders" : "Type / paste path"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-white/12 px-3 py-1.5 text-[13px] text-[#ededed] hover:bg-white/[0.06]"
                  onClick={props.onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-blue-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-600 disabled:opacity-45"
                  disabled={
                    manualMode ? !manualPath.trim() : !selectedPath?.trim() || loading
                  }
                  onClick={() => {
                    const next = manualMode
                      ? manualPath.trim()
                      : (selectedPath?.trim() ?? "");
                    if (!next) return;
                    props.onSelect(next);
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
