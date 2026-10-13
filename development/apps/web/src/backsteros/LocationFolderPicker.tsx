import { useCallback, useEffect, useId, useState } from "react";
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

function parentPath(absolute: string, base: string): string | null {
  const trimmed = absolute.replace(/\/+$/, "");
  const baseTrimmed = base.replace(/\/+$/, "");
  if (!trimmed || trimmed === baseTrimmed || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  const parent = trimmed.slice(0, idx) || "/";
  if (parent.length < baseTrimmed.length) return baseTrimmed;
  return parent;
}

function pathSegments(absolute: string, base: string): string[] {
  const baseTrimmed = base.replace(/\/+$/, "") || "/";
  const trimmed = absolute.replace(/\/+$/, "") || baseTrimmed;
  if (trimmed === baseTrimmed) return [];
  const rest = trimmed.startsWith(`${baseTrimmed}/`)
    ? trimmed.slice(baseTrimmed.length + 1)
    : trimmed.replace(/^\//, "");
  return rest.split("/").filter(Boolean);
}

export function BacksterosLocationFolderPicker(props: Props) {
  const titleId = useId();
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
        const result = await fetchBacksterosLocationFs(props.target, path, {
          projectId: props.projectId,
        });
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
  const canGoUp = listing != null && parentPath(listing.path, listing.base) != null;

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
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(640px,calc(100vh-48px))] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
          <h2 id={titleId} className="m-0 text-[15px] font-semibold text-[#ededed]">
            {props.title}
          </h2>
          {listing ? (
            <div className="flex shrink-0 gap-1.5">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                  listing.exists
                    ? "border-emerald-400/35 text-emerald-300"
                    : "border-amber-400/35 text-amber-300",
                )}
              >
                {listing.exists ? "Exists" : "Missing"}
              </span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                  listing.writable
                    ? "border-emerald-400/35 text-emerald-300"
                    : "border-amber-400/35 text-amber-300",
                )}
              >
                {listing.writable ? "Writable" : "Read-only"}
              </span>
            </div>
          ) : null}
        </header>

        {manualMode ? (
          <div className="flex flex-col gap-2 px-4 py-2">
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
        ) : (
          <>
            <nav
              className="flex flex-wrap items-center gap-0.5 px-4 pb-2"
              aria-label="Current path"
            >
              <button
                type="button"
                className="max-w-[10rem] truncate rounded px-1 py-0.5 text-xs text-sky-300 hover:bg-white/5 disabled:opacity-50"
                disabled={loading || !listing}
                onClick={() => void load(base || null)}
              >
                {base ? base.split("/").filter(Boolean).pop() || base : "…"}
              </button>
              {crumbs.map((segment, index) => {
                const crumbPath = `${base.replace(/\/+$/, "")}/${crumbs.slice(0, index + 1).join("/")}`;
                return (
                  <span key={crumbPath} className="inline-flex items-center">
                    <span className="px-0.5 text-white/35">/</span>
                    <button
                      type="button"
                      className="max-w-[10rem] truncate rounded px-1 py-0.5 text-xs text-sky-300 hover:bg-white/5"
                      disabled={loading}
                      onClick={() => void load(crumbPath)}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 px-4 pb-2">
              <button
                type="button"
                className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[#ededed] disabled:opacity-45"
                disabled={loading || !canGoUp}
                onClick={() => {
                  if (!listing) return;
                  const parent = parentPath(listing.path, listing.base);
                  if (parent) void load(parent);
                }}
              >
                Up
              </button>
              <button
                type="button"
                className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[#ededed] disabled:opacity-45"
                disabled={loading || !listing?.writable}
                onClick={() => {
                  setShowCreate((open) => !open);
                  setNewFolderName("");
                }}
              >
                New folder
              </button>
              <span
                className="min-w-0 flex-1 truncate text-[11px] text-white/55"
                title={listing?.path}
              >
                {listing?.path ?? "…"}
              </span>
            </div>

            {showCreate ? (
              <form
                className="flex gap-2 px-4 pb-2"
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
                        projectId: props.projectId,
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

            <div
              className="mx-2 mb-2 min-h-[180px] flex-1 overflow-auto rounded-lg border border-white/[0.06] bg-[#0f0f0f] p-1"
              role="listbox"
              aria-label="Folders"
            >
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
          </>
        )}

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
              disabled={manualMode ? !manualPath.trim() : !selectedPath?.trim() || loading}
              onClick={() => {
                const next = manualMode ? manualPath.trim() : (selectedPath?.trim() ?? "");
                if (!next) return;
                props.onSelect(next);
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
